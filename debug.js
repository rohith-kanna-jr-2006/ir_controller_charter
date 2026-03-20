const { TrainType } = require('./types');
const ttvals = Object.values(TrainType);
console.log(ttvals);
const header = "12084 - Coimbatore - Mayiladuthurai Jan Shatabdi Express ...";
const searchSpace = (header + ' ' + header).toUpperCase();
console.log('has keyword', searchSpace.includes('JAN SHATABDI'));
for (const tt of ttvals) {
    const norm = tt.replace(/_/g, ' ');
    if (searchSpace.includes(norm)) console.log('found', tt, 'via norm', norm);
}
