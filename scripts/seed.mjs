// Preenche um Boldo em execução com remédios de exemplo (para desenvolvimento e capturas de tela).
// Uso: ADMIN_PASSWORD=... node scripts/seed.mjs [http://localhost:3210]
const base = process.argv[2] ?? 'http://localhost:3210';
const password = process.env.ADMIN_PASSWORD;
if (!password) throw new Error('Defina ADMIN_PASSWORD.');

const login = await fetch(`${base}/api/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password }),
});
if (!login.ok) throw new Error(`Login falhou: ${login.status}`);
const { token } = await login.json();

const month = (offset) => {
  const date = new Date();
  date.setMonth(date.getMonth() + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};
const everyDay = [0, 1, 2, 3, 4, 5, 6];
const weekdays = [1, 2, 3, 4, 5];

const medicines = [
  {
    name: 'Losartana',
    dosage: '50 mg',
    purpose: 'Pressão alta',
    unit: 'comprimido',
    quantity: 28,
    lowThreshold: 10,
    expiresOn: month(10),
    notes: 'Receita da Dra. Helena. Tomar sempre no mesmo horário.',
    schedules: [
      { time: '08:00', days: everyDay, dose: 1 },
      { time: '20:00', days: everyDay, dose: 1 },
    ],
  },
  {
    name: 'Dipirona',
    dosage: '500 mg',
    purpose: 'Dor e febre',
    unit: 'comprimido',
    quantity: 4,
    lowThreshold: 6,
    expiresOn: month(5),
    notes: 'Gaveta do banheiro.',
    schedules: [],
  },
  {
    name: 'Vitamina D',
    dosage: '2.000 UI',
    purpose: 'Suplemento',
    unit: 'capsula',
    quantity: 45,
    lowThreshold: 10,
    expiresOn: month(0),
    notes: '',
    schedules: [{ time: '12:30', days: everyDay, dose: 1 }],
  },
  {
    name: 'Omeprazol',
    dosage: '20 mg',
    purpose: 'Azia e refluxo',
    unit: 'capsula',
    quantity: 14,
    lowThreshold: 7,
    expiresOn: month(15),
    notes: 'Em jejum, 30 minutos antes do café.',
    schedules: [{ time: '07:00', days: weekdays, dose: 1 }],
  },
  {
    name: 'Loratadina',
    dosage: '10 mg',
    purpose: 'Alergia e rinite',
    unit: 'comprimido',
    quantity: 12,
    lowThreshold: 0,
    expiresOn: month(-2),
    notes: '',
    schedules: [],
  },
  {
    name: 'Xarope de guaco',
    dosage: '',
    purpose: 'Tosse',
    unit: 'ml',
    quantity: 120,
    lowThreshold: 30,
    expiresOn: month(7),
    notes: 'Depois de aberto, guardar na geladeira.',
    schedules: [],
  },
  {
    name: 'Soro fisiológico',
    dosage: '0,9%',
    purpose: 'Lavar o nariz',
    unit: 'ampola',
    quantity: 0,
    lowThreshold: 3,
    expiresOn: month(20),
    notes: '',
    schedules: [],
  },
  {
    name: 'Ibuprofeno',
    dosage: '400 mg',
    purpose: 'Dor e inflamação',
    unit: 'comprimido',
    quantity: 20,
    lowThreshold: 5,
    expiresOn: month(13),
    notes: 'Tomar depois de comer.',
    schedules: [],
  },
];

for (const medicine of medicines) {
  const response = await fetch(`${base}/api/medicines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(medicine),
  });
  if (!response.ok) throw new Error(`${medicine.name}: ${await response.text()}`);
  console.log(`+ ${medicine.name}`);
}
