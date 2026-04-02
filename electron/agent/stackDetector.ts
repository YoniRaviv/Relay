import fs from 'node:fs';
import path from 'node:path';

interface StackInfo {
  profile: string;       // e.g. "TypeScript · React 18 · Tailwind · Express · Prisma"
  frameworks: string[];  // individual framework names for rule injection
}

export function detectStack(projectPath: string): StackInfo {
  const detected: string[] = [];
  const frameworks: string[] = [];

  // TypeScript
  if (fs.existsSync(path.join(projectPath, 'tsconfig.json'))) {
    detected.push('TypeScript');
    frameworks.push('typescript');
  }

  // package.json — scan dependencies
  const pkgPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (allDeps['react']) {
        const ver = (allDeps['react'] as string).replace(/[^0-9.]/g, '').split('.')[0];
        detected.push(ver ? `React ${ver}` : 'React');
        frameworks.push('react');
      }
      if (allDeps['next']) { detected.push('Next.js'); frameworks.push('nextjs'); }
      if (allDeps['vue']) { detected.push('Vue'); frameworks.push('vue'); }
      if (allDeps['svelte'] || allDeps['@sveltejs/kit']) { detected.push('Svelte'); frameworks.push('svelte'); }
      if (allDeps['tailwindcss']) { detected.push('Tailwind'); }
      if (allDeps['express']) { detected.push('Express'); frameworks.push('express'); }
      if (allDeps['fastify']) { detected.push('Fastify'); frameworks.push('fastify'); }
      if (allDeps['@prisma/client'] || allDeps['prisma']) { detected.push('Prisma'); frameworks.push('prisma'); }
      if (allDeps['mongoose'] || allDeps['mongodb']) { detected.push('MongoDB'); frameworks.push('mongodb'); }
      if (allDeps['sequelize']) { detected.push('Sequelize'); frameworks.push('sequelize'); }
      if (allDeps['drizzle-orm']) { detected.push('Drizzle'); frameworks.push('drizzle'); }
      if (allDeps['better-sqlite3'] || allDeps['sqlite3']) { detected.push('SQLite'); frameworks.push('sqlite'); }
      if (allDeps['pg']) { detected.push('PostgreSQL'); frameworks.push('postgresql'); }
      if (!detected.includes('TypeScript') && !allDeps['typescript']) {
        detected.unshift('JavaScript');
      }
    } catch { /* ignore parse errors */ }
  }

  // Cargo.toml — Rust
  if (fs.existsSync(path.join(projectPath, 'Cargo.toml'))) {
    detected.push('Rust');
    frameworks.push('rust');
    try {
      const cargo = fs.readFileSync(path.join(projectPath, 'Cargo.toml'), 'utf-8');
      if (cargo.includes('actix')) { detected.push('Actix'); frameworks.push('actix'); }
      if (cargo.includes('tokio')) { detected.push('Tokio'); frameworks.push('tokio'); }
      if (cargo.includes('axum')) { detected.push('Axum'); frameworks.push('axum'); }
    } catch { /* ignore */ }
  }

  // go.mod — Go
  if (fs.existsSync(path.join(projectPath, 'go.mod'))) {
    detected.push('Go');
    frameworks.push('go');
    try {
      const gomod = fs.readFileSync(path.join(projectPath, 'go.mod'), 'utf-8');
      if (gomod.includes('gin-gonic')) { detected.push('Gin'); frameworks.push('gin'); }
      if (gomod.includes('gorilla/mux')) { detected.push('Gorilla'); }
      if (gomod.includes('fiber')) { detected.push('Fiber'); frameworks.push('fiber'); }
    } catch { /* ignore */ }
  }

  // pyproject.toml / requirements.txt — Python
  const pyProject = path.join(projectPath, 'pyproject.toml');
  const reqTxt = path.join(projectPath, 'requirements.txt');
  if (fs.existsSync(pyProject) || fs.existsSync(reqTxt)) {
    detected.push('Python');
    frameworks.push('python');
    try {
      const content = fs.existsSync(pyProject)
        ? fs.readFileSync(pyProject, 'utf-8')
        : fs.readFileSync(reqTxt, 'utf-8');
      if (content.includes('django')) { detected.push('Django'); frameworks.push('django'); }
      if (content.includes('fastapi')) { detected.push('FastAPI'); frameworks.push('fastapi'); }
      if (content.includes('flask')) { detected.push('Flask'); frameworks.push('flask'); }
      if (content.includes('sqlalchemy')) { detected.push('SQLAlchemy'); frameworks.push('sqlalchemy'); }
    } catch { /* ignore */ }
  }

  // Gemfile — Ruby
  if (fs.existsSync(path.join(projectPath, 'Gemfile'))) {
    detected.push('Ruby');
    frameworks.push('ruby');
    try {
      const gemfile = fs.readFileSync(path.join(projectPath, 'Gemfile'), 'utf-8');
      if (gemfile.includes('rails')) { detected.push('Rails'); frameworks.push('rails'); }
    } catch { /* ignore */ }
  }

  // docker-compose
  if (fs.existsSync(path.join(projectPath, 'docker-compose.yml')) ||
      fs.existsSync(path.join(projectPath, 'docker-compose.yaml'))) {
    detected.push('Docker');
  }

  if (detected.length === 0) {
    return { profile: 'Unknown stack', frameworks: [] };
  }

  return { profile: detected.join(' · '), frameworks };
}
