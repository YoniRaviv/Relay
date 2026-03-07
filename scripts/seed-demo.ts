/**
 * Seed script: creates a demo project with PRD + tasks for testing without an API key.
 *
 * Usage: npm run seed-demo
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(__dirname, '..', 'demo-project');
const RELAY_DIR = path.join(DEMO_DIR, '.relay');
const DB_PATH = path.join(RELAY_DIR, 'relay.db');

// ── Setup dirs ──
fs.mkdirSync(RELAY_DIR, { recursive: true });
fs.mkdirSync(path.join(DEMO_DIR, 'src', 'components'), { recursive: true });
fs.mkdirSync(path.join(DEMO_DIR, 'src', 'utils'), { recursive: true });

// ── Init DB with sqlite3 CLI ──
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

function sql(query: string) {
  execSync(`sqlite3 "${DB_PATH}" "${query.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
}

function sqlMulti(queries: string) {
  execSync(`sqlite3 "${DB_PATH}"`, { input: queries, stdio: ['pipe', 'pipe', 'pipe'] });
}

// ── IDs ──
const projectId = randomUUID();
const prdId = randomUUID();
const now = new Date().toISOString();

const taskDefs = [
  { storyId: 'US-001', title: 'City search with current weather display', desc: 'Implement a search bar that queries OpenWeatherMap API and displays current temperature, humidity, wind speed, and conditions for the selected city.', ac: '- Search bar with autocomplete\n- Displays temp, humidity, wind, conditions\n- Loading state while fetching\n- Error state for invalid cities', priority: 'high', status: 'approved', order: 0, passes: 1, notes: '' },
  { storyId: 'US-002', title: 'Hourly forecast chart', desc: 'Add a line chart showing temperature for the next 24 hours using Recharts.', ac: '- Line chart with 24 data points\n- X-axis shows hours, Y-axis shows temp\n- Tooltip on hover\n- Responsive sizing', priority: 'high', status: 'review', order: 1, passes: 1, notes: '' },
  { storyId: 'US-003', title: '5-day forecast grid', desc: 'Display a horizontal grid of 5 cards showing daily high/low temperatures and weather icons.', ac: '- 5 cards in a row\n- Each shows day name, icon, high/low\n- Responsive wrap on mobile', priority: 'medium', status: 'pending', order: 2, passes: 0, notes: '' },
  { storyId: 'US-004', title: 'Favorite cities with localStorage persistence', desc: 'Allow users to save/remove favorite cities. Persist to localStorage and show a favorites bar.', ac: '- Star button to add/remove favorites\n- Favorites bar at top\n- Click favorite to load weather\n- Persists across page reload', priority: 'medium', status: 'pending', order: 3, passes: 0, notes: '' },
  { storyId: 'US-005', title: 'Celsius / Fahrenheit toggle', desc: 'Add a toggle switch to convert all displayed temperatures between Celsius and Fahrenheit.', ac: '- Toggle in header\n- All temps update instantly\n- Preference saved to localStorage', priority: 'low', status: 'pending', order: 4, passes: 0, notes: '' },
  { storyId: 'US-006', title: 'Weather condition icons and animations', desc: 'Map weather condition codes to animated SVG icons (sun, clouds, rain, snow, etc.).', ac: '- Animated icons for major conditions\n- Fallback static icon\n- Icons used in current weather and forecast cards', priority: 'low', status: 'pending', order: 5, passes: 1, notes: '--- Attempt 1 ---\nIcons are static, not animated. Please use CSS animations or Lottie for the weather icons.' },
];

const prdMarkdown = `# Weather Dashboard App

## Introduction
A sleek weather dashboard that displays current conditions, hourly forecast, and 5-day outlook for user-selected cities.

## Goals
- Display real-time weather data from OpenWeatherMap API
- Support searching and saving multiple cities
- Responsive layout for desktop and mobile
- Show temperature, humidity, wind speed, and conditions with icons

## User Stories
- US-001: As a user I can search for a city and see current weather
- US-002: As a user I can see an hourly forecast chart
- US-003: As a user I can view a 5-day forecast grid
- US-004: As a user I can save favorite cities
- US-005: As a user I can toggle between Celsius and Fahrenheit
- US-006: As a user I can see weather condition icons and animations

## Technical Notes
- React + TypeScript
- Tailwind CSS for styling
- Recharts for hourly graph
- localStorage for saved cities`;

// Build SQL
const esc = (s: string) => s.replace(/'/g, "''");
const taskIds: string[] = [];

let statements = `
CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS prd (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', markdown TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, prd_id TEXT NOT NULL, story_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', acceptance_criteria TEXT NOT NULL DEFAULT '', priority TEXT NOT NULL DEFAULT 'medium', status TEXT NOT NULL DEFAULT 'pending', "order" INTEGER NOT NULL DEFAULT 0, passes INTEGER NOT NULL DEFAULT 0, rejection_notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS task_logs (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, type TEXT NOT NULL, content TEXT NOT NULL, timestamp TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS task_metrics (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, duration_ms INTEGER NOT NULL DEFAULT 0, tokens_in INTEGER NOT NULL DEFAULT 0, tokens_out INTEGER NOT NULL DEFAULT 0, tool_calls INTEGER NOT NULL DEFAULT 0, passes INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);

INSERT INTO projects VALUES ('${projectId}', 'Demo Project', '${esc(DEMO_DIR)}', 'active', '${now}', '${now}');
INSERT INTO prd VALUES ('${prdId}', '${projectId}', 'Weather dashboard application', '${esc(prdMarkdown)}', 'approved', '${now}', '${now}');
`;

for (const t of taskDefs) {
  const id = randomUUID();
  taskIds.push(id);
  statements += `INSERT INTO tasks VALUES ('${id}', '${projectId}', '${prdId}', '${t.storyId}', '${esc(t.title)}', '${esc(t.desc)}', '${esc(t.ac)}', '${t.priority}', '${t.status}', ${t.order}, ${t.passes}, ${t.notes ? `'${esc(t.notes)}'` : 'NULL'}, '${now}', '${now}');\n`;
}

// Metrics for approved task
statements += `INSERT INTO task_metrics VALUES ('${randomUUID()}', '${taskIds[0]}', 45000, 12400, 8200, 15, 1, '${now}');\n`;

sqlMulti(statements);

// ── Create source files ──
fs.writeFileSync(path.join(DEMO_DIR, 'src', 'App.tsx'), `import { WeatherDashboard } from './components/WeatherDashboard'

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100">
      <WeatherDashboard />
    </div>
  )
}
`);

fs.writeFileSync(path.join(DEMO_DIR, 'src', 'components', 'HourlyChart.tsx'), `import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface HourlyData {
  hour: string
  temp: number
}

interface HourlyChartProps {
  data: HourlyData[]
}

export function HourlyChart({ data }: HourlyChartProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <h3 className="text-sm font-semibold text-gray-600 mb-3">Hourly Forecast</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}>
          <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Line type="monotone" dataKey="temp" stroke="#3b82f6" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
`);

// ── Init git and create diff for review ──
try {
  execSync('git init', { cwd: DEMO_DIR, stdio: 'pipe' });
  execSync('git add -A', { cwd: DEMO_DIR, stdio: 'pipe' });
  execSync('git commit -m "feat(US-001): City search with current weather display"', { cwd: DEMO_DIR, stdio: 'pipe' });

  // Now modify files so there's a diff for the "review" task (US-002)
  fs.writeFileSync(path.join(DEMO_DIR, 'src', 'components', 'HourlyChart.tsx'), `import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface HourlyData {
  hour: string
  temp: number
  feelsLike: number
}

interface HourlyChartProps {
  data: HourlyData[]
  unit: 'C' | 'F'
}

export function HourlyChart({ data, unit }: HourlyChartProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <h3 className="text-sm font-semibold text-gray-600 mb-3">
        Hourly Forecast ({unit === 'C' ? 'Celsius' : 'Fahrenheit'})
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}>
          <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} unit={\`°\${unit}\`} />
          <Tooltip
            formatter={(value: number) => [\`\${value}°\${unit}\`, 'Temperature']}
          />
          <Line type="monotone" dataKey="temp" stroke="#3b82f6" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="feelsLike" stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 4" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
`);

  // New file
  fs.writeFileSync(path.join(DEMO_DIR, 'src', 'utils', 'formatTemp.ts'), `export function formatTemp(temp: number, unit: 'C' | 'F'): string {
  if (unit === 'F') {
    return \`\${Math.round(temp * 9/5 + 32)}°F\`
  }
  return \`\${Math.round(temp)}°C\`
}
`);

  console.log('   Git repo initialized with uncommitted changes for diff review');
} catch (e) {
  console.warn('   Git setup warning:', (e as Error).message);
}

console.log('');
console.log('✅ Demo project seeded at:', DEMO_DIR);
console.log('');
console.log('Tasks:');
for (const t of taskDefs) {
  console.log(`  ${t.storyId} [${t.status.padEnd(8)}] ${t.title}`);
}
console.log('');
console.log('To test:');
console.log('  1. npm run dev');
console.log('  2. Enter "dev-bypass" as the API key');
console.log('  3. Open the demo-project folder');
console.log('  4. Board loads with tasks — click "Review" on US-002');
