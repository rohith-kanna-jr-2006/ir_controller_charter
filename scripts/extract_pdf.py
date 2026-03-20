import sys
import json
import re
from datetime import datetime

try:
    import PyPDF2
except ImportError:
    print('PyPDF2 not installed', file=sys.stderr)
    sys.exit(1)


def parse_pdf_text(full_text: str):
    # lines cleanup
    lines = [l.strip() for l in full_text.splitlines() if l.strip()]
    if not lines:
        return None

    # first line contains number and name
    first = lines[0]
    m = re.match(r"(\d+)\s*/\s*(.+)", first)
    train_num = None
    train_name = None
    if m:
        train_num = m.group(1)
        train_name = m.group(2)
    else:
        # fallback split by space
        parts = first.split(None, 1)
        train_num = parts[0]
        train_name = parts[1] if len(parts) > 1 else ''

    # find days of service and type
    type_line = None
    days_line = None
    for l in lines:
        if l.lower().startswith('type:'):
            type_line = l
        if 'Departs' in l or 'Runs' in l:
            days_line = l
    train_type = None
    if type_line:
        # e.g. "Type: Jan Shatabdi   Zone: SR"
        train_type = type_line.split(':',1)[1].split()[0].strip()

    days = []
    if days_line:
        # extract day words after Departs
        m = re.search(r'Departs\s+([A-Za-z,]+)', days_line)
        if m:
            day_str = m.group(1)
            names = [d.strip() for d in day_str.split(',')]
            mapping = {'Sun':0,'Mon':1,'Tue':2,'Wed':3,'Thu':4,'Fri':5,'Sat':6}
            for n in names:
                if n in mapping:
                    days.append(mapping[n])
    # station table: find header line index
    station_lines = []
    header_idx = None
    for idx,l in enumerate(lines):
        if l.startswith('#Code'):
            header_idx = idx
            break
    if header_idx is not None:
        for l in lines[header_idx+1:]:
            # each row begins with something like "1CBE" where number is serial and code follows
            m = re.match(r"^(\d+)([A-Z]+)", l)
            code = m.group(2) if m else None
            # capture all time-looking strings
            times = re.findall(r"\d{1,2}:\d{2}", l)
            arr = times[0] if len(times) >= 1 else None
            dep = times[1] if len(times) >= 2 else None
            station_lines.append((code, l, arr, dep))

    # build TrainPath-style dict
    train = {
        'id': train_num,
        'number': train_num,
        'name': train_name,
        'type': train_type,
        'color': '#000000',
        'priority': 6,
        'points': [],
        'daysOfService': days
    }
    for code,name,arr,dep in station_lines:
        # parse times
        def parse_time(t):
            try:
                return datetime.strptime(t, '%H:%M').isoformat()
            except:
                return None
        train['points'].append({
            'stationCode': code,
            'arrivalTime': parse_time(arr),
            'departureTime': parse_time(dep)
        })
    return train



files = sys.argv[1:]
if not files:
    print("Usage: extract_pdf.py <file1.pdf> [file2.pdf ...]", file=sys.stderr)
    sys.exit(1)

results = []
for path in files:
    try:
        reader = PyPDF2.PdfReader(path)
        text = []
        for page in reader.pages:
            content = page.extract_text()
            if content:
                text.append(content)
        full = "\n".join(text)
        # debug: dump lines
        lines = [l.strip() for l in full.splitlines() if l.strip()]
        print(f"--- extracted lines for {path} ---", file=sys.stderr)
        for idx,l in enumerate(lines):
            print(idx, repr(l), file=sys.stderr)
        print(f"--- end lines for {path} ---", file=sys.stderr)

        parsed = parse_pdf_text(full)
        if parsed:
            parsed['sourceFile'] = path
            results.append(parsed)
        else:
            results.append({'sourceFile': path, 'raw': full})
    except Exception as e:
        print(f"error processing {path}: {e}", file=sys.stderr)
        continue

# output combined JSON
print(json.dumps(results, indent=2))
