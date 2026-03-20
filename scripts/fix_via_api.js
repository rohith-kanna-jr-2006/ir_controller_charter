const main = async () => {
  try {
    const res = await fetch('http://localhost:3001/api/trains');
    if (!res.ok) {
      console.log('STATUS:', res.status, res.statusText);
      console.log('BODY:', await res.text());
      throw new Error('Fail');
    }
    const trains = await res.json();
    let count = 0;

    for (const train of trains) {
      if (!train.name) continue;

      let parsedName = train.name;
      const cutoffMatch = parsedName.match(/\s[A-Z]{2,4}\//);
      if (cutoffMatch) {
        parsedName = parsedName.substring(0, cutoffMatch.index).trim();
      } else {
        const typeZoneMatch = parsedName.match(/\s(?:Type|Zone):/);
        if (typeZoneMatch) {
          parsedName = parsedName.substring(0, typeZoneMatch.index).trim();
        }
      }

      parsedName = parsedName.replace(/[\s\-]+$/, '');

      if (train.number && !parsedName.startsWith(train.number)) {
        parsedName = `${train.number} - ${parsedName}`;
      }

      if (parsedName !== train.name) {
        train.name = parsedName;
        const putRes = await fetch(`http://127.0.0.1:3001/api/trains/${train.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(train)
        });
        if (!putRes.ok) throw new Error('Failed to update train ' + train.id);
        console.log(`Updated ${train.number}: ${parsedName}`);
        count++;
      }
    }
    console.log(`Fixed ${count} train names successfully.`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

main();
