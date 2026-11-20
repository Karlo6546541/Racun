// Pokretanje: node tests/parser.test.js
const assert = require('assert');
const P = require('../parser.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('✓ ' + name); }
  catch (e) { console.error('✗ ' + name + '\n  ' + e.message); process.exitCode = 1; }
}

const konzum = `KONZUM plus d.o.o.
Marijana Čavića 1a, Zagreb
OIB: 29955634590
Račun br: 1234/56/7
Datum: 14.03.2025 Vrijeme: 17:42
MLIJEKO 2,8% 1L      1,29
KRUH BIJELI          1,99
PDV 13%              0,38
UKUPNO EUR          13,47
GOTOVINA            20,00
POVRAT               6,53`;

const tehnika = `Links
Links d.o.o.
Datum računa: 02/11/2024
Laptop Lenovo IdeaPad      1.149,99
Ukupno za platiti:
1.149,99 €
Jamstvo vrijedi do 02/11/2026`;

test('prepoznaje trgovinu s d.o.o.', () => {
  assert.strictEqual(P.parseReceipt(konzum).store, 'KONZUM plus d.o.o.');
});
test('prepoznaje datum dd.mm.yyyy', () => {
  assert.strictEqual(P.parseReceipt(konzum).date, '2025-03-14');
});
test('prepoznaje ukupno, ignorira PDV i povrat', () => {
  assert.strictEqual(P.parseReceipt(konzum).total, 13.47);
});
test('iznos s točkom za tisućice i iznos u idućem retku', () => {
  assert.strictEqual(P.parseReceipt(tehnika).total, 1149.99);
});
test('ignorira budući datum (vrijedi do)', () => {
  assert.strictEqual(P.parseReceipt(tehnika).date, '2024-11-02');
});
test('datum s O umjesto 0', () => {
  assert.strictEqual(P.findDate('Datum: O5.O1.2025'), '2025-01-05');
});
test('kratka godina', () => {
  assert.strictEqual(P.findDate('5.6.24'), '2024-06-05');
});
test('parseAmount', () => {
  assert.strictEqual(P.parseAmount('1.234,56'), 1234.56);
  assert.strictEqual(P.parseAmount('12,99'), 12.99);
  assert.strictEqual(P.parseAmount('12.99'), 12.99);
});
test('addMonths - garancija 2 godine', () => {
  assert.strictEqual(P.addMonths('2025-03-14', 24), '2027-03-14');
  assert.strictEqual(P.addMonths('2024-01-31', 1), '2024-02-29');
});
test('prazan tekst', () => {
  assert.deepStrictEqual(P.parseReceipt(''), { store: '', date: null, total: null });
});

console.log(`\n${passed} testova prošlo`);
