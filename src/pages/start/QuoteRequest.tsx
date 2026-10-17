import { useState } from 'react'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { Btn, Field, inputCls } from '../../components/ui'
import { submitQuoteRequest } from '../../data/signup'
import type { QuoteRequest as QR } from '../../data/signup'

export default function QuoteRequest({ seed, planId, planName, modules, reason, onBack }: { seed: { company: string; contact: string; email: string; phone: string; employees: number; industry: string; state: string }; planId: string; planName: string; modules: string[]; reason?: string; onBack: () => void }) {
  const [f, setF] = useState({ ...seed, branches: '', timeline: '1–3 months', requirements: '' })
  const [done, setDone] = useState<QR | null>(null)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: k === 'employees' ? Math.max(0, Number(e.target.value) || 0) : e.target.value })
  if (done) return (
    <div className="py-6 text-center" role="status">
      <CheckCircle2 size={40} className="mx-auto text-ok" />
      <h2 className="mt-3 text-xl font-semibold">Quote request sent</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate">Thanks, {done.contact.split(' ')[0] || 'there'}. Our sales team will email a tailored {planName} quote to <b>{done.email}</b> within one business day.</p>
      <p className="mt-3 font-mono text-sm">Request {done.id}</p>
      <div className="mt-6 flex justify-center gap-2"><Btn v="secondary" onClick={onBack}>Back to plans</Btn><Btn to="/contact" v="ghost">Contact BizFlow</Btn></div>
    </div>
  )
  const ok = f.company.trim() && f.contact.trim() && /\S+@\S+\.\S+/.test(f.email) && f.phone.trim() && f.employees >= 1
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!ok) return; setDone(submitQuoteRequest({ company: f.company, contact: f.contact, email: f.email, phone: f.phone, employees: f.employees, industry: f.industry, state: f.state, planId, modules, branches: f.branches, timeline: f.timeline, requirements: f.requirements, reason: reason ?? 'Enterprise plan' })) }} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><div className="text-xs font-semibold uppercase tracking-wider text-teal">Talk to sales</div><h2 className="mt-1 text-xl font-semibold">Request a {planName} quote</h2><p className="mt-1 text-sm text-slate">{reason ?? 'Enterprise workspaces are scoped with our team.'} Tell us a little about your organisation and we will send a tailored proposal. You will not be charged.</p></div>
      <Field label="Company name"><input required value={f.company} onChange={set('company')} className={inputCls} placeholder="ABC Company Limited" /></Field>
      <Field label="Contact person"><input required value={f.contact} onChange={set('contact')} className={inputCls} placeholder="Ada Obi" /></Field>
      <Field label="Work email"><input required type="email" value={f.email} onChange={set('email')} className={inputCls} placeholder="you@abccompany.com" /></Field>
      <Field label="Phone number"><input required value={f.phone} onChange={set('phone')} className={inputCls} placeholder="+234 800 000 0000" /></Field>
      <Field label="Number of employees"><input required type="number" min={1} value={f.employees || ''} onChange={set('employees')} className={inputCls} /></Field>
      <Field label="Branches / locations"><input value={f.branches} onChange={set('branches')} className={inputCls} placeholder="e.g. 12 branches across 6 states" /></Field>
      <Field label="Rollout timeline"><select value={f.timeline} onChange={set('timeline')} className={inputCls}>{['Immediately', '1–3 months', '3–6 months', 'Just exploring'].map((x) => <option key={x}>{x}</option>)}</select></Field>
      <div className="sm:col-span-2"><Field label="Requirements (optional)"><textarea value={f.requirements} onChange={set('requirements')} rows={3} className={`${inputCls} h-auto py-2`} placeholder="Integrations, compliance needs, data migration, support expectations" /></Field></div>
      <div className="flex items-center justify-between sm:col-span-2"><Btn type="button" v="ghost" onClick={onBack}><ArrowLeft size={15} />Back to plans</Btn><Btn type="submit" disabled={!ok}>Send quote request</Btn></div>
    </form>
  )
}
