
import React, { useEffect, useRef, useState, useMemo } from 'react';
// Fix: Import d3 as a namespace to resolve "no exported member" errors during build
import * as d3 from 'd3';
import { TrainPath, Station, ChartConfig } from '../types';
import { DIVISIONS, GET_JUNCTION_HUBS } from '../constants';

interface MasterChartProps {
  trains: TrainPath[];
  stations: Station[];
  config: ChartConfig;
  onTrainClick: (train: TrainPath) => void;
}

const findStationGlobally = (stationId: string): Station | undefined => {
  for (const div of DIVISIONS) {
    const found = div.stations.find(s => s.id === stationId);
    if (found) return found;
  }
  const code = stationId.split('_')[0];
  for (const div of DIVISIONS) {
    const found = div.stations.find(s => s.code === code);
    if (found) return found;
  }
  return undefined;
};

const MasterChart: React.FC<MasterChartProps> = ({ trains, stations, config, onTrainClick }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  
  const junctionCodes = useMemo(() => new Set(GET_JUNCTION_HUBS().map(h => h.code)), []);

  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (!containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      setDimensions({ width: clientWidth, height: clientHeight });
    };
    const resizeObserver = new ResizeObserver(() => updateSize());
    resizeObserver.observe(containerRef.current);
    updateSize();
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0 || dimensions.height === 0 || stations.length === 0) return;

    const { width, height } = dimensions;
    const margin = { top: 60, right: 120, bottom: 40, left: 140 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // STEP 1 & 3: ABSOLUTE & DYNAMIC TIME RANGE
    const allAbsPoints: number[] = [];
    trains.forEach(t => {
      t.points.forEach(p => {
        const hArr = p.arrivalTime.getHours();
        const mArr = p.arrivalTime.getMinutes();
        const absArr = (p.runtime_day_offset || 0) * 1440 + (hArr * 60 + mArr);
        
        const hDep = p.departureTime.getHours();
        const mDep = p.departureTime.getMinutes();
        const absDep = (p.runtime_day_offset || 0) * 1440 + (hDep * 60 + mDep);
        
        allAbsPoints.push(absArr, absDep);
      });
    });

    const minAbs = allAbsPoints.length > 0 ? d3.min(allAbsPoints)! : 0;
    const maxAbs = allAbsPoints.length > 0 ? d3.max(allAbsPoints)! : 1440;
    const bufferMinutes = 60; // 1 hour buffer at end
    const timeDomain = [minAbs, Math.max(minAbs + 60, maxAbs + bufferMinutes)];

    // STEP 2 & 4: NORMALIZE & CLAMP X
    const xScale = d3.scaleLinear()
      .domain(timeDomain)
      .rangeRound([0, innerWidth])
      .clamp(true);

    const sortedByKm = [...stations].sort((a, b) => a.km - b.km);
    const minKm = d3.min(sortedByKm, s => s.km) || 0;
    const maxKm = d3.max(sortedByKm, s => s.km) || 100;
    
    // STEP 4 & 6: CLAMP & FIX Y
    const yScale = d3.scaleLinear()
      .domain([minKm, maxKm])
      .rangeRound([0, innerHeight])
      .clamp(true);

    // Dynamic Time Grid (Every 60 mins/1 hour)
    const gridTicks = [];
    for (let t = Math.floor(minAbs / 60) * 60; t <= timeDomain[1]; t += 60) {
      gridTicks.push(t);
    }

    g.selectAll(".time-line")
      .data(gridTicks)
      .enter()
      .append("line")
      .attr("x1", d => xScale(d)).attr("x2", d => xScale(d))
      .attr("y1", 0).attr("y2", innerHeight)
      .attr("stroke", "#cbd5e1")
      .attr("stroke-width", 0.5)
      .style("stroke-dasharray", "2,2");

    g.selectAll(".station-line")
      .data(stations)
      .enter()
      .append("line")
      .attr("x1", 0).attr("x2", innerWidth)
      .attr("y1", d => yScale(d.km)).attr("y2", d => yScale(d.km))
      .attr("stroke", d => junctionCodes.has(d.code) ? "#94a3b8" : "#e2e8f0")
      .attr("stroke-width", d => junctionCodes.has(d.code) ? 1 : 0.5);

    // Left Station Labels
    const labels = g.selectAll(".station-label-group")
      .data(stations)
      .enter()
      .append("g")
      .attr("transform", d => `translate(-15, ${yScale(d.km)})`);

    labels.each(function(d) {
      const el = d3.select(this);
      const isJunction = junctionCodes.has(d.code);
      if (isJunction) {
        el.append("rect").attr("x", -45).attr("y", -8).attr("width", 40).attr("height", 16).attr("rx", 4).attr("fill", "#4f46e5");
        el.append("text").attr("x", -25).attr("y", 0).attr("dy", "0.32em").attr("text-anchor", "middle").attr("class", "fill-white font-black text-[10px]").text(d.code);
      } else {
        el.append("text").attr("x", 0).attr("y", 0).attr("dy", "0.32em").attr("text-anchor", "end").attr("class", "fill-slate-500 font-bold text-[10px]").text(d.code);
      }
    });

    // Time Labels (Day X HH:MM format)
    g.selectAll(".hour-label")
      .data(gridTicks)
      .enter()
      .append("text")
      .attr("x", d => xScale(d)).attr("y", -20)
      .attr("text-anchor", "middle")
      .attr("class", "fill-slate-900 font-black text-[10px]")
      .text(d => {
        const dayNum = Math.floor(d / 1440) + 1;
        const hh = Math.floor((d % 1440) / 60);
        return `D${dayNum} ${hh.toString().padStart(2, '0')}:00`;
      });

    const pathsLayer = g.append("g").attr("clip-path", "url(#chart-clip)");
    const markersLayer = g.append("g").attr("clip-path", "url(#chart-clip)");

    // Define Clip Path (Step 1 & 4)
    svg.append("defs").append("clipPath")
      .attr("id", "chart-clip")
      .append("rect")
      .attr("width", innerWidth)
      .attr("height", innerHeight);

    const processedTrains = trains.map(train => {
      const renderPoints: Array<{x: number, y: number}> = [];
      train.points.forEach(p => {
        const station = stations.find(s => s.code === (findStationGlobally(p.stationId)?.code || p.stationId.split('_')[0]));
        if (station) {
          const absArr = (p.runtime_day_offset || 0) * 1440 + (p.arrivalTime.getHours() * 60 + p.arrivalTime.getMinutes());
          const absDep = (p.runtime_day_offset || 0) * 1440 + (p.departureTime.getHours() * 60 + p.departureTime.getMinutes());
          renderPoints.push({ x: xScale(absArr), y: yScale(station.km) });
          renderPoints.push({ x: xScale(absDep), y: yScale(station.km) });
        }
      });
      // CRITICAL: Prevent diagonal crossing by sorting (Step 5)
      renderPoints.sort((a, b) => a.x - b.x);
      return { ...train, renderPoints };
    });

    // Conflict detection (Overtakes and Crossings)
    const findIntersection = (p1: any, p2: any, p3: any, p4: any) => {
      const det = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
      if (Math.abs(det) < 0.01) return null;
      const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / det;
      const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / det;
      if (t > 0 && t < 1 && u > 0 && u < 1) {
        return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
      }
      return null;
    };

    processedTrains.forEach(train => {
      const allPoints = train.renderPoints.filter(p => !isNaN(p.x));
      if (allPoints.length < 2) return;

      // STEP 2: BREAK LINE SEGMENTS (Avoid Connecting Across Boundaries)
      const segments: any[][] = [];
      let currentSeg: any[] = [];

      allPoints.forEach((p, idx) => {
        if (idx > 0) {
          const prev = allPoints[idx - 1];
          // Detect Break: Backward time jump or very large gap (Step 5)
          const dx = p.x - prev.x;
          if (dx < 0 || dx > innerWidth * 0.7) {
            if (currentSeg.length >= 2) segments.push(currentSeg);
            currentSeg = [];
          }
        }
        currentSeg.push(p);
      });
      if (currentSeg.length >= 2) segments.push(currentSeg);

      segments.forEach(points => {
        // STEP 3: DRAW ONLY VISIBLE SEGMENTS
        const isVisible = points.some(p => p.x >= -10 && p.x <= innerWidth + 10);
        if (!isVisible) return;

        const isFreight = train.type === 'FREIGHT';
        const strokeWidth = train.priority <= 4 ? 4.5 : (train.priority <= 8 ? 2.5 : 1.5);
        const lineGen = d3.line<any>().x(d => d.x).y(d => d.y).curve(d3.curveMonotoneX);
        
        pathsLayer.append("path")
          .datum(points)
          .attr("d", lineGen)
          .attr("stroke", train.color)
          .attr("stroke-width", strokeWidth)
          .attr("fill", "none")
          .attr("stroke-linecap", "round")
          .attr("stroke-linejoin", "round")
          .attr("opacity", 0.75)
          .style("stroke-dasharray", isFreight ? "6,4" : "none")
          .attr("class", "cursor-pointer hover:opacity-100 transition-all")
          .on("click", (e) => { e.stopPropagation(); onTrainClick(train); });

        // Highlight Halts
        for (let i = 0; i < points.length - 1; i++) {
          const p1 = points[i];
          const p2 = points[i+1];
          if (Math.abs(p1.y - p2.y) < 0.1 && Math.abs(p1.x - p2.x) > 1) {
            pathsLayer.append("line")
              .attr("x1", p1.x).attr("y1", p1.y).attr("x2", p2.x).attr("y2", p2.y)
              .attr("stroke", train.color).attr("stroke-width", strokeWidth + 2)
              .attr("stroke-linecap", "round").attr("opacity", 0.9);
          }
        }
      });

      // Labels (Visible range only)
      const visiblePoints = allPoints.filter(p => p.x >= 0 && p.x <= innerWidth);
      if (visiblePoints.length < 1) return;

      const trainNumber = (train as any).trainNumber || train.number || train.id;
      const fullLabel = trainNumber;

      const drawLabelWithHalo = (p: any, anchor: string, isEnd: boolean) => {
        const offset = isEnd ? 18 : -12;
        const altOffset = (parseInt(trainNumber) % 2 === 0) ? offset : (offset * -1.5);
        const labelGroup = pathsLayer.append("g").attr("transform", `translate(${p.x}, ${p.y + altOffset})`);
        labelGroup.append("text").attr("text-anchor", anchor).attr("class", "font-black text-[10px]").attr("stroke", "white").attr("stroke-width", 3).text(fullLabel);
        labelGroup.append("text").attr("text-anchor", anchor).attr("class", "font-black text-[10px]").attr("fill", train.color).text(fullLabel);
      };

      if (visiblePoints.length > 0) {
        drawLabelWithHalo(visiblePoints[0], "start", false);
        if (visiblePoints.length > 1) {
          drawLabelWithHalo(visiblePoints[visiblePoints.length - 1], "end", true);
        }
      }
    });


    // STEP 6: IMPROVED INTERSECTION MARKS
    // Define Glow/Shadow Filter
    const defs = svg.select("defs").size() > 0 ? svg.select("defs") : svg.append("defs");
    defs.append("filter").attr("id", "marker-glow")
      .append("feGaussianBlur").attr("stdDeviation", "2").attr("result", "coloredBlur");

    for (let i = 0; i < processedTrains.length; i++) {
      for (let j = i + 1; j < processedTrains.length; j++) {
        const t1 = processedTrains[i];
        const t2 = processedTrains[j];
        for (let k = 0; k < t1.renderPoints.length - 1; k++) {
          for (let l = 0; l < t2.renderPoints.length - 1; l++) {
            const intersect = findIntersection(t1.renderPoints[k], t1.renderPoints[k+1], t2.renderPoints[l], t2.renderPoints[l+1]);
            if (intersect && intersect.x >= 0 && intersect.x <= innerWidth) {
              const dy1 = t1.renderPoints[k+1].y - t1.renderPoints[k].y;
              const dy2 = t2.renderPoints[l+1].y - t2.renderPoints[l].y;
              const isOvertake = (dy1 * dy2 > 0);
              
              const mGroup = markersLayer.append("g").attr("transform", `translate(${intersect.x}, ${intersect.y})`);

              if (isOvertake) {
                // PREMIUM OVERTAKE MARKER (Amber Circle with Glow)
                mGroup.append("circle").attr("r", 7).attr("fill", "#f59e0b").attr("opacity", 0.3).attr("filter", "url(#marker-glow)");
                mGroup.append("circle").attr("r", 5).attr("fill", "#f59e0b").attr("stroke", "white").attr("stroke-width", 1.5);
                mGroup.append("circle").attr("r", 1.5).attr("fill", "white");
              } else {
                // PREMIUM CROSSING MARKER (Indigo Diamond)
                const dSize = 5;
                mGroup.append("polygon")
                  .attr("points", `0,-${dSize} ${dSize},0 0,${dSize} -${dSize},0`)
                  .attr("fill", "#4f46e5").attr("stroke", "white").attr("stroke-width", 1.5);
                mGroup.append("circle").attr("r", 1).attr("fill", "white");
              }
            }
          }
        }
      }
    }

  }, [trains, stations, config, onTrainClick, dimensions, junctionCodes]);

  return (
    <div ref={containerRef} className="w-full h-full bg-white rounded-2xl shadow-inner border border-slate-300 relative overflow-hidden p-8">
      <svg ref={svgRef} width="100%" height="100%" className="overflow-visible" />
    </div>
  );
};

export default MasterChart;
