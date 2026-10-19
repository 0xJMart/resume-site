import { parse } from 'yaml';
import raw from './resume.yaml?raw';

export interface Job {
  company: string;
  role: string;
  start: string;
  end: string;
  note?: string;
  bullets: string[];
}
export interface Cert {
  name: string;
  issuer: string;
  issued: string;
  expires?: string;
}
export interface Project {
  name: string;
  blurb: string;
  tags: string[];
  link?: string;
  status?: string;
}
export interface Resume {
  name: string;
  title: string;
  tagline: string;
  location: string;
  email: string;
  links: { github: string; linkedin: string };
  summary: string;
  experience: Job[];
  skills: Record<string, string[]>;
  certifications: Cert[];
  education: { school: string; degree: string; years: string }[];
  projects: Project[];
}

export const resume = parse(raw) as Resume;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtMonth(ym: string): string {
  if (ym === 'present') return 'Present';
  const [y, m] = String(ym).split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

// Expired certs are listed as "earned <year>", never as active
export function certStatus(c: Cert, now = new Date()): { active: boolean; label: string } {
  const year = String(c.issued).slice(0, 4);
  if (!c.expires) return { active: true, label: `Since ${year}` };
  const [y, m] = String(c.expires).split('-').map(Number);
  const active = new Date(y, m, 1) > now;
  return active ? { active, label: `Valid to ${fmtMonth(c.expires)}` } : { active, label: `Earned ${year}` };
}
