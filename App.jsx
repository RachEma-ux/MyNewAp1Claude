import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Home, Briefcase, Users, CheckSquare, Calendar, ChevronLeft, ChevronRight, ChevronDown,
  Plus, Search, MoreHorizontal, Star, Sun, Moon, LogOut, MessageCircle, Heart, Clock,
  Sparkles, ArrowRight, RefreshCw, X, Code, FileText, Pencil, BarChart3,
  Smile, Settings, PieChart, Ticket, Video, MapPin, Trash2, Check, User
} from "lucide-react";

/* =================================================================
   CSS — full design system inline
   ================================================================= */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&family=Geist:wght@300;400;500;600;700&display=swap');

:root {
  --ink-950:#131426; --ink-900:#1A1B2E; --ink-800:#22243B; --ink-700:#2D2F4A; --ink-card:#2A2C45;
  --cream:#F4F3F8; --white:#FFFFFF; --hairline:#ECECF1; --hairline-2:#E1E1EA;
  --text-950:#0F1024; --text-900:#1A1B2E; --text-700:#4A4B63; --text-500:#8A8B9F;
  --text-400:#B4B5C5; --text-on-dark:#E8E8F0; --text-on-dark-dim:#8E90A8;
  --lime:#D7FE4F; --lime-deep:#BBE93A; --purple:#7C6BF4; --purple-soft:#A99CFF; --purple-bg:#EDEAFE;
  --c-green:#6BD68A; --c-purple:#7C6BF4; --c-teal:#4DD0C7; --c-violet:#9B6BE0;
  --c-coral:#F26B6B; --c-amber:#F0A23A; --c-blue:#5B8FF9; --c-pink:#EE7CB8;
  --radius-card:22px; --radius-lg:18px; --radius-md:14px; --radius-sm:10px; --radius-pill:999px;
  --shadow-card:0 1px 2px rgba(20,21,42,.04),0 8px 24px rgba(20,21,42,.04);
  --shadow-card-hover:0 2px 4px rgba(20,21,42,.06),0 18px 40px rgba(20,21,42,.10);
  --shadow-inset:inset 0 0 0 1px rgba(255,255,255,0.04);
}

* { box-sizing:border-box; margin:0; padding:0; }
html, body, #root { height:100%; }

body {
  font-family:'Geist',system-ui,-apple-system,sans-serif;
  background:radial-gradient(ellipse at 0% 50%,rgba(124,107,244,.18),transparent 40%),linear-gradient(180deg,#0E0F22 0%,#15162B 100%);
  color:var(--text-900); min-height:100vh; padding:18px;
  -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale; letter-spacing:-0.005em;
}
a { color:inherit; text-decoration:none; }
button { font-family:inherit; cursor:pointer; }

.app { display:grid; grid-template-columns:56px 264px 1fr 360px; background:var(--ink-900);
  border-radius:28px; overflow:hidden; min-height:calc(100vh - 36px); box-shadow:0 30px 80px rgba(0,0,0,.4);
  position:relative; }
.app::before { content:''; position:absolute; left:-1px; top:12%; bottom:12%; width:6px;
  background:linear-gradient(180deg,transparent,rgba(169,156,255,.5),transparent); filter:blur(8px); pointer-events:none; }

/* RAIL */
.rail { background:var(--ink-950); display:flex; flex-direction:column; align-items:center;
  padding:18px 0; gap:4px; border-right:1px solid rgba(255,255,255,.04); }
.rail-logo { width:38px; height:38px; display:grid; place-items:center;
  font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:22px;
  color:var(--lime); letter-spacing:-0.04em; margin-bottom:14px; position:relative; }
.rail-logo::after { content:'›'; position:absolute; right:-22px; top:8px;
  color:var(--text-on-dark-dim); font-size:14px; font-weight:400; }
.rail-btn { width:38px; height:38px; border-radius:10px; display:grid; place-items:center;
  color:var(--text-on-dark-dim); cursor:pointer; transition:all .2s; background:transparent; border:0; }
.rail-btn:hover { color:var(--text-on-dark); background:rgba(255,255,255,.04); }
.rail-btn.is-active { color:var(--purple-soft); }
.rail-spacer { flex:1; }
.rail-avatar { width:38px; height:38px; border-radius:12px; overflow:hidden;
  background:linear-gradient(135deg,#7C6BF4,#4DD0C7); display:grid; place-items:center;
  color:white; font-weight:600; font-size:12px; margin-bottom:6px; cursor:pointer; }

/* SIDEBAR */
.sidebar { background:var(--ink-900); padding:22px 18px 18px; display:flex; flex-direction:column;
  border-right:1px solid rgba(255,255,255,.04); }
.brand { display:flex; align-items:center; justify-content:space-between; padding:4px 4px 26px; }
.brand-name { font-family:'Bricolage Grotesque',sans-serif; font-weight:700; font-size:26px;
  color:var(--white); letter-spacing:-0.03em; }
.brand-name .ai-accent { color:var(--lime); }
.brand-collapse { width:28px; height:28px; border-radius:8px; background:rgba(255,255,255,.05);
  color:var(--text-on-dark-dim); display:grid; place-items:center; cursor:pointer; border:0;
  transition:background .2s; }
.brand-collapse:hover { background:rgba(255,255,255,.08); }

.nav { display:flex; flex-direction:column; gap:4px; }
.nav-item { display:flex; align-items:center; gap:12px; padding:12px 14px;
  border-radius:var(--radius-md); color:var(--text-on-dark-dim); font-size:14.5px; font-weight:500;
  cursor:pointer; transition:all .18s; border:0; background:transparent; width:100%; text-align:left;
  position:relative; }
.nav-item:hover { color:var(--text-on-dark); background:rgba(255,255,255,.04); }
.nav-item.is-active { background:var(--ink-700); color:var(--white); box-shadow:var(--shadow-inset); }
.nav-item svg { flex-shrink:0; }
.nav-item .chevron { margin-left:auto; opacity:.6; }
.nav-item .dot { width:6px; height:6px; border-radius:50%; background:var(--c-coral);
  margin-left:6px; box-shadow:0 0 8px rgba(242,107,107,.7); }

.sidebar-bottom { margin-top:auto; display:flex; flex-direction:column; gap:14px; }
.secondary-links { display:flex; flex-direction:column; gap:14px; padding:4px 14px; }
.secondary-links a { color:var(--text-on-dark-dim); font-size:13.5px; font-weight:500;
  transition:color .2s; cursor:pointer; }
.secondary-links a:hover { color:var(--text-on-dark); }

.profile-card { background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.06);
  border-radius:var(--radius-md); padding:10px; display:flex; align-items:center; gap:10px; }
.profile-card .avatar { width:38px; height:38px; border-radius:10px; overflow:hidden;
  background:linear-gradient(135deg,#5b3f9c,#e6a8b8); display:grid; place-items:center;
  color:white; font-weight:600; font-size:13px; flex-shrink:0; }
.profile-meta { flex:1; min-width:0; }
.profile-name { display:flex; align-items:center; gap:6px; color:var(--white);
  font-size:13.5px; font-weight:600; }
.pro-badge { background:var(--purple); color:white; font-size:9.5px; font-weight:600;
  padding:2px 7px; border-radius:var(--radius-pill); letter-spacing:.02em; }
.profile-email { color:var(--text-on-dark-dim); font-size:11.5px; margin-top:2px;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

.controls { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.ctrl { height:38px; border-radius:var(--radius-pill); background:rgba(255,255,255,.04);
  border:1px solid rgba(255,255,255,.06); color:var(--text-on-dark); display:flex;
  align-items:center; justify-content:center; gap:7px; font-size:12.5px; font-weight:500;
  cursor:pointer; transition:all .2s; }
.ctrl:hover { background:rgba(255,255,255,.07); }
.theme-switch { padding:4px; gap:0; background:rgba(255,255,255,.04); }
.theme-opt { flex:1; height:100%; border-radius:var(--radius-pill); display:flex;
  align-items:center; justify-content:center; gap:4px; font-size:11.5px; font-weight:500;
  color:var(--text-on-dark-dim); cursor:pointer; transition:all .2s; }
.theme-opt.is-active { background:var(--ink-700); color:var(--text-on-dark); }

/* MAIN */
.main { background:var(--cream); border-radius:24px 0 0 24px; overflow-y:auto; padding:30px 36px; }
.feed { background:var(--cream); padding:30px 24px; overflow-y:auto; border-left:1px solid var(--hairline); }

.page-head { display:flex; align-items:flex-start; justify-content:space-between; gap:24px; margin-bottom:26px; }
.page-title { font-family:'Bricolage Grotesque',sans-serif; font-weight:700; font-size:30px;
  letter-spacing:-0.025em; color:var(--text-950); line-height:1.15; }
.page-sub { color:var(--text-500); font-size:14px; margin-top:8px; }
.add-btn { width:48px; height:48px; background:var(--purple); color:white; border-radius:14px;
  border:0; display:grid; place-items:center; cursor:pointer; transition:all .2s;
  box-shadow:0 6px 16px rgba(124,107,244,.35); flex-shrink:0; }
.add-btn:hover { transform:translateY(-1px); box-shadow:0 8px 20px rgba(124,107,244,.45); }

/* HOME */
.cards { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.topic-card { background:var(--white); border-radius:var(--radius-card); padding:22px;
  cursor:pointer; transition:all .22s; border:1px solid transparent; position:relative; overflow:hidden;
  animation:rise .5s ease-out both; }
.topic-card:hover { transform:translateY(-2px); box-shadow:var(--shadow-card-hover); border-color:var(--hairline); }
.topic-card::before { content:''; position:absolute; inset:0;
  background:radial-gradient(circle at top right,rgba(124,107,244,.04),transparent 60%);
  opacity:0; transition:opacity .25s; }
.topic-card:hover::before { opacity:1; }
.topic-icon { width:42px; height:42px; display:grid; place-items:center; margin-bottom:22px; }
.topic-name { font-family:'Bricolage Grotesque',sans-serif; font-size:19px; font-weight:600;
  color:var(--text-900); letter-spacing:-0.015em; }
.topic-meta { position:absolute; bottom:22px; right:22px; color:var(--text-500); font-size:12px; font-weight:500; }
.topic-card:nth-child(1) { animation-delay:.05s; }
.topic-card:nth-child(2) { animation-delay:.1s; }
.topic-card:nth-child(3) { animation-delay:.15s; }
.topic-card:nth-child(4) { animation-delay:.2s; }
.topic-card:nth-child(5) { animation-delay:.25s; }
.topic-card:nth-child(6) { animation-delay:.3s; }

.cta { margin-top:18px; background:linear-gradient(135deg,#2A2C45 0%,#1B1D33 100%);
  border-radius:var(--radius-card); padding:30px 30px 26px; color:white; position:relative;
  overflow:hidden; isolation:isolate; }
.cta-waves { position:absolute; inset:0; z-index:0; opacity:.55; }
.cta-title { font-family:'Bricolage Grotesque',sans-serif; font-weight:700; font-size:28px;
  letter-spacing:-0.025em; line-height:1.15; max-width:380px; margin-bottom:8px; position:relative; z-index:1; }
.cta-title .lime { color:var(--lime); }
.cta-sub { color:var(--text-on-dark-dim); font-size:13.5px; margin-bottom:18px; position:relative; z-index:1; }
.cta-search { display:flex; gap:8px; background:rgba(255,255,255,.05);
  border:1px solid rgba(255,255,255,.07); padding:6px; border-radius:var(--radius-pill);
  position:relative; z-index:1; backdrop-filter:blur(8px); }
.cta-input { flex:1; background:transparent; border:0; color:white; padding:0 16px; font-size:13.5px;
  outline:none; display:flex; align-items:center; gap:10px; }
.cta-input input { background:transparent; border:0; color:white; font-family:inherit;
  font-size:13.5px; outline:none; width:100%; }
.cta-input input::placeholder { color:var(--text-on-dark-dim); }
.cta-btn { background:var(--lime); color:var(--text-950); border:0; padding:0 28px; height:40px;
  border-radius:var(--radius-pill); font-weight:600; font-size:13.5px; cursor:pointer; transition:all .2s; }
.cta-btn:hover { background:var(--lime-deep); transform:translateY(-1px); }

/* FEED (Home) */
.feed-head { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:18px; }
.feed-title { font-family:'Bricolage Grotesque',sans-serif; font-weight:700; font-size:22px;
  letter-spacing:-0.02em; color:var(--text-950); }
.feed-sub { color:var(--text-500); font-size:12.5px; margin-top:3px; }
.refresh-btn { background:var(--purple-bg); color:var(--purple); border:0; padding:7px 12px;
  border-radius:var(--radius-pill); font-size:12px; font-weight:500; cursor:pointer;
  display:flex; align-items:center; gap:5px; transition:all .2s; }
.refresh-btn:hover { background:#DFD9FC; }
.refresh-btn.spinning svg { animation:spin .7s ease-in-out; }
@keyframes spin { from { transform:rotate(0); } to { transform:rotate(-360deg); } }

.promo { margin-top:14px;
  background:radial-gradient(circle at 80% 60%,rgba(170,215,110,.65),transparent 55%),
    radial-gradient(circle at 90% 30%,rgba(220,240,130,.5),transparent 50%),
    radial-gradient(circle at 30% 100%,rgba(40,80,60,.8),transparent 60%),
    linear-gradient(135deg,#1F4733 0%,#2A6048 60%,#4A8B6A 100%);
  border-radius:var(--radius-card); padding:24px 22px 22px; color:white; position:relative;
  overflow:hidden; min-height:180px; }
.promo::before { content:''; position:absolute; right:-40px; top:-40px; width:200px; height:200px;
  background:radial-gradient(circle,rgba(215,254,79,.18) 0%,transparent 70%); filter:blur(20px); }
.promo-title { font-family:'Bricolage Grotesque',sans-serif; font-weight:700; font-size:22px;
  letter-spacing:-0.02em; line-height:1.2; margin-bottom:4px; position:relative; max-width:220px; }
.promo-sub { font-size:12.5px; opacity:.85; margin-bottom:18px; position:relative; }
.promo-btn { background:var(--lime); color:var(--text-950); border:0; padding:10px 22px;
  border-radius:var(--radius-pill); font-weight:600; font-size:13px; cursor:pointer;
  transition:all .2s; position:relative; box-shadow:0 6px 18px rgba(215,254,79,.3); }
.promo-btn:hover { background:var(--lime-deep); transform:translateY(-1px); }

.blog-heading { font-size:13.5px; font-weight:600; color:var(--text-900); margin:26px 0 12px; }
.blog-list { display:flex; flex-direction:column; gap:10px; }
.blog-card { background:var(--white); border-radius:var(--radius-lg); padding:14px;
  transition:all .2s; cursor:pointer; border:1px solid transparent;
  animation:rise .5s ease-out both; }
.blog-card:hover { border-color:var(--hairline); box-shadow:var(--shadow-card); }
.blog-card:nth-child(1) { animation-delay:.35s; }
.blog-card:nth-child(2) { animation-delay:.42s; }
.blog-card:nth-child(3) { animation-delay:.49s; }
.blog-card:nth-child(4) { animation-delay:.56s; }
.blog-author { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
.blog-avatar { width:36px; height:36px; border-radius:50%;
  background:linear-gradient(135deg,#c7d2fe,#a5b4fc); color:white; display:grid; place-items:center;
  font-weight:600; font-size:13px; flex-shrink:0; }
.blog-author-meta { flex:1; min-width:0; }
.blog-author-name { font-size:13px; font-weight:600; color:var(--text-900); }
.blog-author-desc { font-size:11.5px; color:var(--text-500); margin-top:1px; }
.blog-more { width:24px; height:24px; background:transparent; border:0; border-radius:50%;
  color:var(--text-400); cursor:pointer; display:grid; place-items:center; transition:background .2s; }
.blog-more:hover { background:var(--hairline); }
.blog-text { font-size:13px; color:var(--text-700); line-height:1.45; margin-bottom:12px; }
.blog-foot { display:flex; align-items:center; gap:14px; }
.blog-stat { display:flex; align-items:center; gap:5px; color:var(--text-500); font-size:12px; }
.open-btn { margin-left:auto; background:var(--purple-bg); color:var(--purple); border:0;
  padding:5px 14px; border-radius:var(--radius-pill); font-size:11.5px; font-weight:600;
  cursor:pointer; transition:all .2s; }
.open-btn:hover { background:#DFD9FC; }

.av-1 { background:linear-gradient(135deg,#1a1a2e,#4a4a6e); }
.av-2 { background:linear-gradient(135deg,#f4c2a1,#e8a47b); }
.av-3 { background:linear-gradient(135deg,#b8c5d6,#8b9bb0); }
.av-4 { background:linear-gradient(135deg,#d4a574,#b8895a); }
.av-5 { background:linear-gradient(135deg,#7C6BF4,#A99CFF); }
.av-6 { background:linear-gradient(135deg,#4DD0C7,#6BD68A); }
.av-7 { background:linear-gradient(135deg,#F26B6B,#F0A23A); }
.av-8 { background:linear-gradient(135deg,#5B8FF9,#7C6BF4); }

/* PILLS */
.pill-row { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:22px; }
.pill { background:var(--white); border:1px solid var(--hairline); color:var(--text-700);
  padding:8px 14px; border-radius:var(--radius-pill); font-size:13px; font-weight:500;
  cursor:pointer; transition:all .18s; display:inline-flex; align-items:center; gap:7px; }
.pill:hover { border-color:var(--text-400); }
.pill.is-active { background:var(--ink-900); color:var(--white); border-color:var(--ink-900); }
.pill .count { background:var(--hairline); color:var(--text-700); font-size:11px;
  padding:1px 7px; border-radius:var(--radius-pill); font-weight:600; }
.pill.is-active .count { background:rgba(255,255,255,.15); color:var(--white); }

/* PROJECTS */
.proj-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.proj-card { background:var(--white); border-radius:var(--radius-card); padding:22px;
  cursor:pointer; transition:all .22s; border:1px solid transparent; position:relative;
  overflow:hidden; animation:rise .5s ease-out both; }
.proj-card:hover { transform:translateY(-2px); box-shadow:var(--shadow-card-hover); border-color:var(--hairline); }
.proj-card:hover .proj-delete { opacity:1; }
.proj-card:nth-child(1) { animation-delay:.05s; }
.proj-card:nth-child(2) { animation-delay:.1s; }
.proj-card:nth-child(3) { animation-delay:.15s; }
.proj-card:nth-child(4) { animation-delay:.2s; }
.proj-card:nth-child(5) { animation-delay:.25s; }
.proj-card:nth-child(6) { animation-delay:.3s; }
.proj-stripe { position:absolute; left:0; top:0; bottom:0; width:4px; }
.proj-top { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
.proj-tag { font-size:11px; font-weight:600; padding:4px 10px; border-radius:var(--radius-pill);
  letter-spacing:.02em; text-transform:uppercase; }
.proj-delete { background:transparent; border:0; color:var(--text-400); cursor:pointer;
  width:24px; height:24px; border-radius:6px; display:grid; place-items:center;
  opacity:0; transition:all .2s; }
.proj-delete:hover { background:#FCE5E5; color:var(--c-coral); }
.proj-name { font-family:'Bricolage Grotesque',sans-serif; font-size:19px; font-weight:600;
  color:var(--text-900); letter-spacing:-0.015em; margin-bottom:6px; }
.proj-desc { font-size:13px; color:var(--text-500); line-height:1.45; margin-bottom:18px;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.proj-progress { margin-bottom:16px; }
.proj-progress-head { display:flex; justify-content:space-between; font-size:11.5px;
  color:var(--text-500); font-weight:500; margin-bottom:6px; }
.proj-progress-bar { height:6px; background:var(--hairline); border-radius:var(--radius-pill); overflow:hidden; }
.proj-progress-fill { height:100%; border-radius:var(--radius-pill); transition:width .6s ease-out; }
.proj-foot { display:flex; align-items:center; justify-content:space-between; }
.avatar-stack { display:flex; }
.avatar-stack .avatar { width:26px; height:26px; border-radius:50%;
  border:2px solid var(--white); display:grid; place-items:center; color:white;
  font-weight:600; font-size:10px; margin-left:-8px; }
.avatar-stack .avatar:first-child { margin-left:0; }
.avatar-stack .more { background:var(--hairline); color:var(--text-700); font-size:10px; }
.proj-due { display:flex; align-items:center; gap:6px; font-size:12px;
  color:var(--text-500); font-weight:500; }

.stats-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:22px; }
.stat-card { background:var(--white); border-radius:var(--radius-lg); padding:14px; }
.stat-label { font-size:11.5px; color:var(--text-500); font-weight:500; margin-bottom:6px; }
.stat-val { font-family:'Bricolage Grotesque',sans-serif; font-size:24px; font-weight:700;
  color:var(--text-950); letter-spacing:-0.02em; }
.stat-delta { font-size:11px; color:var(--c-green); font-weight:600; margin-top:4px;
  display:flex; align-items:center; gap:3px; }
.stat-delta.neg { color:var(--c-coral); }

.activity { background:var(--white); border-radius:var(--radius-card); padding:18px; }
.activity-list { display:flex; flex-direction:column; gap:14px; }
.activity-item { display:flex; gap:10px; align-items:flex-start; }
.activity-dot { width:8px; height:8px; border-radius:50%; margin-top:5px; flex-shrink:0; }
.activity-meta { flex:1; }
.activity-text { font-size:12.5px; color:var(--text-700); line-height:1.45; }
.activity-text strong { color:var(--text-950); font-weight:600; }
.activity-time { font-size:11px; color:var(--text-400); margin-top:2px; }

/* AGENTS */
.agent-featured { background:radial-gradient(circle at 90% 30%,rgba(215,254,79,.25),transparent 50%),
    radial-gradient(circle at 10% 80%,rgba(124,107,244,.35),transparent 50%),
    linear-gradient(135deg,#1F1B3A 0%,#2D2856 100%);
  border-radius:var(--radius-card); padding:26px; color:white; margin-bottom:16px;
  position:relative; overflow:hidden; display:grid; grid-template-columns:1fr auto; gap:24px; align-items:center; }
.agent-featured-meta { position:relative; z-index:1; }
.agent-featured-tag { display:inline-block; background:rgba(215,254,79,.15); color:var(--lime);
  font-size:10.5px; font-weight:600; padding:4px 10px; border-radius:var(--radius-pill);
  letter-spacing:.04em; text-transform:uppercase; margin-bottom:12px; }
.agent-featured-title { font-family:'Bricolage Grotesque',sans-serif; font-weight:700;
  font-size:26px; letter-spacing:-0.02em; line-height:1.2; margin-bottom:6px; }
.agent-featured-desc { font-size:13.5px; color:var(--text-on-dark-dim); margin-bottom:16px;
  max-width:380px; line-height:1.5; }
.agent-featured-cta { background:var(--lime); color:var(--text-950); border:0; padding:10px 20px;
  border-radius:var(--radius-pill); font-weight:600; font-size:13px; cursor:pointer;
  transition:all .2s; display:inline-flex; align-items:center; gap:6px; }
.agent-featured-cta:hover { background:var(--lime-deep); transform:translateY(-1px); }
.agent-orb { width:130px; height:130px; position:relative; flex-shrink:0; }
.agent-orb-bg { position:absolute; inset:0; border-radius:50%;
  background:radial-gradient(circle at 35% 35%,#D7FE4F,#6BD68A 40%,#2A6048 80%);
  box-shadow:0 0 60px rgba(215,254,79,.4),inset -10px -20px 40px rgba(0,0,0,.3);
  animation:pulse 4s ease-in-out infinite; }
@keyframes pulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.05); } }

.agent-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.agent-card { background:var(--white); border-radius:var(--radius-card); padding:20px;
  cursor:pointer; transition:all .22s; border:1px solid transparent;
  animation:rise .5s ease-out both; }
.agent-card:hover { transform:translateY(-2px); box-shadow:var(--shadow-card-hover); border-color:var(--hairline); }
.agent-card:nth-child(1) { animation-delay:.05s; }
.agent-card:nth-child(2) { animation-delay:.1s; }
.agent-card:nth-child(3) { animation-delay:.15s; }
.agent-card:nth-child(4) { animation-delay:.2s; }
.agent-card:nth-child(5) { animation-delay:.25s; }
.agent-card:nth-child(6) { animation-delay:.3s; }
.agent-avatar { width:48px; height:48px; border-radius:14px; display:grid; place-items:center;
  color:white; margin-bottom:14px; }
.agent-name { font-family:'Bricolage Grotesque',sans-serif; font-size:17px; font-weight:600;
  color:var(--text-900); letter-spacing:-0.015em; }
.agent-role { font-size:12px; color:var(--c-purple); font-weight:500; margin-top:2px; }
.agent-desc { font-size:12.5px; color:var(--text-500); line-height:1.45; margin:10px 0 14px;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.agent-stats { display:flex; align-items:center; justify-content:space-between;
  padding-top:14px; border-top:1px solid var(--hairline); }
.agent-stat-group { display:flex; gap:12px; }
.agent-stat { display:flex; align-items:center; gap:4px; font-size:11.5px; color:var(--text-500); }
.agent-stat strong { color:var(--text-900); font-weight:600; }
.agent-use-btn { background:var(--ink-900); color:white; border:0; padding:6px 14px;
  border-radius:var(--radius-pill); font-size:11.5px; font-weight:600; cursor:pointer; transition:all .2s; }
.agent-use-btn:hover { background:var(--purple); }
.agent-use-btn:active { transform:scale(.97); }

/* TASKS */
.task-quickadd { background:var(--white); border-radius:var(--radius-card); padding:14px 18px;
  display:flex; align-items:center; gap:12px; margin-bottom:18px; border:1px solid var(--hairline);
  transition:border-color .2s; }
.task-quickadd:focus-within { border-color:var(--purple-soft); }
.task-quickadd input { flex:1; border:0; outline:none; font-family:inherit; font-size:14px;
  color:var(--text-900); background:transparent; }
.task-quickadd input::placeholder { color:var(--text-400); }
.task-quickadd-icon { width:32px; height:32px; background:var(--purple); color:white;
  border-radius:10px; display:grid; place-items:center; border:0; cursor:pointer;
  transition:all .2s; }
.task-quickadd-icon:hover { background:#6857F0; transform:scale(1.05); }

.tabs { display:flex; gap:4px; background:var(--white); padding:4px; border-radius:var(--radius-pill);
  border:1px solid var(--hairline); margin-bottom:18px; width:fit-content; }
.tab { padding:7px 16px; border-radius:var(--radius-pill); font-size:13px; font-weight:500;
  color:var(--text-500); cursor:pointer; transition:all .18s; display:flex; align-items:center;
  gap:6px; border:0; background:transparent; }
.tab.is-active { background:var(--ink-900); color:var(--white); }
.tab .count { background:var(--hairline); color:var(--text-700); font-size:10.5px;
  padding:1px 6px; border-radius:var(--radius-pill); font-weight:600; }
.tab.is-active .count { background:rgba(255,255,255,.15); color:var(--white); }

.task-list { background:var(--white); border-radius:var(--radius-card); overflow:hidden;
  border:1px solid var(--hairline); }
.task-row { display:flex; align-items:center; gap:14px; padding:14px 20px;
  border-bottom:1px solid var(--hairline); transition:background .15s; cursor:pointer; }
.task-row:last-child { border-bottom:0; }
.task-row:hover { background:#FAFAFD; }
.task-row:hover .task-delete { opacity:1; }
.task-row.is-done .task-title { text-decoration:line-through; color:var(--text-400); }
.task-empty { padding:40px 20px; text-align:center; color:var(--text-500); font-size:14px; }

.task-check { width:20px; height:20px; border:2px solid var(--text-400); border-radius:6px;
  cursor:pointer; display:grid; place-items:center; transition:all .2s; flex-shrink:0;
  background:transparent; }
.task-check.is-checked { background:var(--c-green); border-color:var(--c-green); color:white; }
.task-priority { width:6px; height:24px; border-radius:3px; flex-shrink:0; }
.task-priority.p-high { background:var(--c-coral); }
.task-priority.p-med { background:var(--c-amber); }
.task-priority.p-low { background:var(--c-blue); }
.task-body { flex:1; min-width:0; }
.task-title { font-size:14px; font-weight:500; color:var(--text-900); }
.task-meta-row { display:flex; gap:12px; align-items:center; margin-top:4px; }
.task-project { font-size:11px; padding:2px 8px; border-radius:var(--radius-pill); font-weight:600; }
.task-time { font-size:11.5px; color:var(--text-500); display:flex; align-items:center; gap:4px; }
.task-assignee { width:28px; height:28px; border-radius:50%; display:grid; place-items:center;
  color:white; font-weight:600; font-size:11px; flex-shrink:0; }
.task-delete { background:transparent; border:0; color:var(--text-400); cursor:pointer;
  width:28px; height:28px; border-radius:6px; display:grid; place-items:center;
  opacity:0; transition:all .2s; flex-shrink:0; }
.task-delete:hover { background:#FCE5E5; color:var(--c-coral); }

.progress-ring-card { background:var(--white); border-radius:var(--radius-card); padding:22px;
  text-align:center; margin-bottom:14px; }
.progress-ring { width:140px; height:140px; margin:0 auto 12px; position:relative; }
.progress-ring-text { position:absolute; inset:0; display:flex; flex-direction:column;
  align-items:center; justify-content:center; }
.progress-ring-num { font-family:'Bricolage Grotesque',sans-serif; font-size:30px; font-weight:700;
  color:var(--text-950); letter-spacing:-0.02em; }
.progress-ring-label { font-size:11px; color:var(--text-500); }
.progress-ring-title { font-family:'Bricolage Grotesque',sans-serif; font-size:16px;
  font-weight:600; color:var(--text-900); margin-bottom:4px; }
.progress-ring-sub { font-size:12.5px; color:var(--text-500); }

.week-chart { background:var(--white); border-radius:var(--radius-card); padding:18px; margin-bottom:14px; }
.week-chart-title { font-family:'Bricolage Grotesque',sans-serif; font-size:14.5px;
  font-weight:600; margin-bottom:14px; }
.bars { display:grid; grid-template-columns:repeat(7,1fr); gap:8px; align-items:end; height:90px; }
.bar-col { display:flex; flex-direction:column; align-items:center; gap:6px; height:100%; justify-content:flex-end; }
.bar { width:100%; background:linear-gradient(180deg,var(--c-purple),var(--purple-soft));
  border-radius:4px 4px 0 0; min-height:4px; transition:height .5s ease-out; }
.bar.is-today { background:linear-gradient(180deg,var(--c-green),#9BE5B0); }
.bar-label { font-size:10px; color:var(--text-500); font-weight:500; }

.focus-timer { background:linear-gradient(135deg,var(--ink-900),var(--ink-800));
  border-radius:var(--radius-card); padding:22px; color:white; text-align:center; }
.focus-time { font-family:'Bricolage Grotesque',sans-serif; font-size:36px; font-weight:700;
  letter-spacing:-0.02em; margin:8px 0; font-variant-numeric:tabular-nums; }
.focus-label { font-size:12px; color:var(--text-on-dark-dim); text-transform:uppercase; letter-spacing:.05em; }
.focus-btn { background:var(--lime); color:var(--text-950); border:0; padding:8px 24px;
  border-radius:var(--radius-pill); font-weight:600; font-size:12px; cursor:pointer;
  margin-top:10px; transition:all .2s; }
.focus-btn:hover { background:var(--lime-deep); }

/* CALENDAR */
.cal-toolbar { display:flex; align-items:center; gap:12px; margin-bottom:20px; }
.cal-nav-btn { width:36px; height:36px; background:var(--white); border:1px solid var(--hairline);
  border-radius:10px; color:var(--text-700); display:grid; place-items:center; cursor:pointer;
  transition:all .2s; }
.cal-nav-btn:hover { border-color:var(--text-400); }
.cal-today-btn { background:var(--ink-900); color:white; border:0; padding:9px 16px;
  border-radius:10px; font-size:13px; font-weight:500; cursor:pointer; transition:all .2s; }
.cal-today-btn:hover { background:var(--purple); }
.cal-view-toggle { margin-left:auto; display:flex; background:var(--white);
  border:1px solid var(--hairline); border-radius:10px; padding:3px; }
.cal-view-opt { padding:6px 14px; border-radius:8px; font-size:12.5px; font-weight:500;
  color:var(--text-500); cursor:pointer; border:0; background:transparent; }
.cal-view-opt.is-active { background:var(--ink-900); color:white; }

.cal-grid { background:var(--white); border-radius:var(--radius-card); overflow:hidden;
  border:1px solid var(--hairline); }
.cal-week-head { display:grid; grid-template-columns:repeat(7,1fr); background:#FAFAFD;
  border-bottom:1px solid var(--hairline); }
.cal-week-head-cell { padding:12px; font-size:11px; font-weight:600; color:var(--text-500);
  text-transform:uppercase; letter-spacing:.05em; text-align:center; }
.cal-body { display:grid; grid-template-columns:repeat(7,1fr); }
.cal-day { min-height:95px; padding:8px; border-right:1px solid var(--hairline);
  border-bottom:1px solid var(--hairline); display:flex; flex-direction:column; gap:4px;
  position:relative; cursor:pointer; transition:background .15s; }
.cal-day:nth-child(7n) { border-right:0; }
.cal-day:hover { background:#FAFAFD; }
.cal-day.is-other-month .cal-day-num { color:var(--text-400); }
.cal-day.is-today .cal-day-num { background:var(--ink-900); color:white;
  width:24px; height:24px; border-radius:50%; display:grid; place-items:center; font-weight:700; }
.cal-day-num { font-size:12.5px; font-weight:600; color:var(--text-700); margin-bottom:2px; }
.cal-event { font-size:10.5px; font-weight:500; padding:3px 6px; border-radius:4px;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; transition:transform .15s; }
.cal-event:hover { transform:translateX(2px); }

.timeline { background:var(--white); border-radius:var(--radius-card); padding:18px; margin-bottom:14px; }
.timeline-title { font-family:'Bricolage Grotesque',sans-serif; font-size:16px; font-weight:600; margin-bottom:4px; }
.timeline-sub { font-size:12px; color:var(--text-500); margin-bottom:16px; }
.timeline-list { display:flex; flex-direction:column; }
.timeline-item { display:grid; grid-template-columns:50px 1fr; gap:12px; padding:10px 0;
  position:relative; border-bottom:1px solid var(--hairline); }
.timeline-item:last-child { border-bottom:0; }
.timeline-time { font-size:11px; color:var(--text-500); font-weight:600; padding-top:2px; }
.timeline-block { padding:10px 12px; border-radius:10px; border-left:3px solid; }
.timeline-block-title { font-size:12.5px; font-weight:600; color:var(--text-900); }
.timeline-block-meta { font-size:11px; color:var(--text-500); margin-top:2px; }
.timeline-empty { padding:20px; text-align:center; color:var(--text-500); font-size:13px; }

.upcoming-card { background:var(--white); border-radius:var(--radius-card); padding:18px; }
.upcoming-title { font-family:'Bricolage Grotesque',sans-serif; font-size:14.5px;
  font-weight:600; margin-bottom:14px; }
.up-item { display:flex; gap:12px; padding:10px 0; border-bottom:1px solid var(--hairline); }
.up-item:last-child { border-bottom:0; }
.up-date { flex-shrink:0; width:42px; background:#F4F3F8; border-radius:8px;
  padding:6px 0; text-align:center; }
.up-date-d { font-family:'Bricolage Grotesque',sans-serif; font-size:16px; font-weight:700;
  color:var(--text-950); line-height:1; }
.up-date-m { font-size:9.5px; color:var(--text-500); font-weight:600;
  text-transform:uppercase; letter-spacing:.05em; }
.up-body { flex:1; }
.up-name { font-size:12.5px; font-weight:600; color:var(--text-900); }
.up-time { font-size:11px; color:var(--text-500); margin-top:2px; }

/* MODAL */
.modal-backdrop { position:fixed; inset:0; background:rgba(20,21,42,.5);
  backdrop-filter:blur(4px); display:grid; place-items:center; z-index:100;
  animation:fadeIn .2s ease-out; }
.modal { background:var(--white); border-radius:var(--radius-card); padding:24px;
  width:90%; max-width:440px; box-shadow:0 30px 60px rgba(0,0,0,.3);
  animation:modalRise .25s ease-out; max-height:90vh; overflow-y:auto; }
@keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
@keyframes modalRise { from { opacity:0; transform:translateY(20px) scale(.95); }
  to { opacity:1; transform:translateY(0) scale(1); } }
.modal-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:18px; }
.modal-title { font-family:'Bricolage Grotesque',sans-serif; font-size:20px; font-weight:700;
  color:var(--text-950); letter-spacing:-0.02em; }
.modal-close { background:transparent; border:0; cursor:pointer; color:var(--text-500);
  width:32px; height:32px; border-radius:8px; display:grid; place-items:center; transition:background .2s; }
.modal-close:hover { background:var(--hairline); }
.field { margin-bottom:14px; }
.field label { display:block; font-size:11.5px; font-weight:600; color:var(--text-700);
  margin-bottom:6px; letter-spacing:.02em; }
.field input, .field textarea, .field select {
  width:100%; padding:10px 12px; border:1px solid var(--hairline); border-radius:10px;
  font-family:inherit; font-size:13.5px; color:var(--text-900); outline:none; transition:border-color .2s;
  background:var(--white); }
.field input:focus, .field textarea:focus, .field select:focus { border-color:var(--purple-soft); }
.field textarea { resize:vertical; min-height:70px; }
.field-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.color-row { display:flex; gap:8px; flex-wrap:wrap; }
.color-swatch { width:28px; height:28px; border-radius:8px; cursor:pointer;
  border:2px solid transparent; transition:all .15s; }
.color-swatch.is-selected { border-color:var(--text-950); transform:scale(1.1); }
.modal-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:20px; }
.btn-primary { background:var(--ink-900); color:white; border:0; padding:10px 18px;
  border-radius:10px; font-size:13px; font-weight:600; cursor:pointer; transition:all .2s; }
.btn-primary:hover { background:var(--purple); }
.btn-secondary { background:var(--hairline); color:var(--text-700); border:0; padding:10px 18px;
  border-radius:10px; font-size:13px; font-weight:600; cursor:pointer; transition:all .2s; }
.btn-secondary:hover { background:var(--hairline-2); }

/* SCROLL */
.main::-webkit-scrollbar, .feed::-webkit-scrollbar { width:6px; }
.main::-webkit-scrollbar-track, .feed::-webkit-scrollbar-track { background:transparent; }
.main::-webkit-scrollbar-thumb, .feed::-webkit-scrollbar-thumb { background:#DDDDE5; border-radius:10px; }

/* ANIMATIONS */
@keyframes rise { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }

/* RESPONSIVE */
@media (max-width:1280px) {
  .app { grid-template-columns:56px 240px 1fr 320px; }
  .main { padding:26px 28px; }
  .page-title { font-size:26px; }
  .cards, .proj-grid, .agent-grid { gap:12px; }
}
@media (max-width:1024px) {
  body { padding:12px; }
  .app { grid-template-columns:56px 1fr; min-height:auto; }
  .main, .feed { display:none; }
}
@media (max-width:640px) {
  body { padding:8px; }
  .app { grid-template-columns:1fr; }
  .rail { display:none; }
}
`;

/* =================================================================
   DATE HELPERS
   ================================================================= */
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const WEEKDAY_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const isoKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const todayDate = new Date();
const TODAY_ISO = isoKey(todayDate);

function getCalendarGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const startDow = firstDay.getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const days = [];
  for (let i = startDow-1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ day:d.getDate(), month:d.getMonth(), year:d.getFullYear(), iso:isoKey(d), other:true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dd = new Date(year, month, d);
    days.push({ day:d, month, year, iso:isoKey(dd), other:false });
  }
  while (days.length < 42) {
    const next = days.length - daysInMonth - startDow + 1;
    const d = new Date(year, month+1, next);
    days.push({ day:d.getDate(), month:d.getMonth(), year:d.getFullYear(), iso:isoKey(d), other:true });
  }
  return days;
}

function relativeDay(iso) {
  const d = new Date(iso);
  const diff = Math.round((d - new Date(TODAY_ISO)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return d.toLocaleDateString("en-US",{weekday:"long"});
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff/60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m/60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h/24);
  if (d === 1) return "yesterday";
  return `${d} days ago`;
}

/* =================================================================
   SEED DATA
   ================================================================= */
function seedProjects() {
  return [
    { id:"p1", name:"Design System Refresh", desc:"Rebuild component library, unify tokens across web + mobile, and ship Figma documentation.", category:"Design", color:"#7C6BF4", tagFg:"#7C6BF4", tagBg:"#EDEAFE", progress:78, due:"May 24", team:[{i:"MW",cls:"av-1"},{i:"CH",cls:"av-5"},{i:"JD",cls:"av-6"}], teamMore:2, status:"active" },
    { id:"p2", name:"Agent Orchestration Engine", desc:"Production-grade multi-agent runtime with retries, queueing, and observability.", category:"Engineering", color:"#6BD68A", tagFg:"#2D8A4D", tagBg:"#E5F8EA", progress:42, due:"Jun 12", team:[{i:"MM",cls:"av-7"},{i:"DR",cls:"av-8"}], teamMore:4, status:"active" },
    { id:"p3", name:"Q3 Launch Campaign", desc:"Pre-launch waitlist, blog series, partner integrations, and announcement video production.", category:"Marketing", color:"#F0A23A", tagFg:"#B47318", tagBg:"#FDF1DA", progress:91, due:"May 20", team:[{i:"CH",cls:"av-2"},{i:"MM",cls:"av-3"}], teamMore:0, status:"active" },
    { id:"p4", name:"User Behavior Study", desc:"Long-form interviews + session replays to inform the next onboarding redesign.", category:"Research", color:"#4DD0C7", tagFg:"#2A9489", tagBg:"#E0F7F5", progress:23, due:"Jul 03", team:[{i:"DR",cls:"av-4"},{i:"MW",cls:"av-5"}], teamMore:1, status:"hold" },
    { id:"p5", name:"iOS Voice Companion", desc:"Hands-free agent interactions with on-device speech, push-to-talk, and contextual replies.", category:"Mobile", color:"#F26B6B", tagFg:"#B73E3E", tagBg:"#FCE5E5", progress:56, due:"Jun 28", team:[{i:"JD",cls:"av-6"},{i:"CH",cls:"av-7"}], teamMore:3, status:"active" },
    { id:"p6", name:"Knowledge Base Migration", desc:"Consolidate 6 wikis into a single searchable hub with AI-assisted curation.", category:"Internal", color:"#9B6BE0", tagFg:"#6C3AA8", tagBg:"#F0E5FA", progress:34, due:"Aug 15", team:[{i:"MW",cls:"av-8"},{i:"DR",cls:"av-1"}], teamMore:0, status:"hold" }
  ];
}

function seedAgents() {
  return [
    { id:"a1", name:"Quill", role:"Writing & Copy", desc:"Drafts long-form articles, marketing copy, and crisp product writeups with editorial polish.", rating:4.9, runs:12000, gradient:"linear-gradient(135deg,#7C6BF4,#A99CFF)", iconName:"pencil", category:"Writing", lastUsed:null },
    { id:"a2", name:"Cypher", role:"Code & Debug", desc:"Writes, reviews, and refactors code across 30+ languages with sharp test coverage instincts.", rating:4.8, runs:28000, gradient:"linear-gradient(135deg,#6BD68A,#4DD0C7)", iconName:"code", category:"Coding", lastUsed:null },
    { id:"a3", name:"Atlas", role:"Research & Analysis", desc:"Reads hundreds of sources, cross-references claims, and outputs concise structured briefs.", rating:5.0, runs:9400, gradient:"linear-gradient(135deg,#F26B6B,#F0A23A)", iconName:"folder", category:"Research", lastUsed:null, featured:true },
    { id:"a4", name:"Pulse", role:"Data & Insights", desc:"Turns raw spreadsheets into clear narratives — charts, takeaways, recommended actions.", rating:4.7, runs:6100, gradient:"linear-gradient(135deg,#5B8FF9,#7C6BF4)", iconName:"bar", category:"Research", lastUsed:null },
    { id:"a5", name:"Echo", role:"Customer Reply", desc:"Reads tickets, learns your tone, and drafts warm, accurate responses for inbox triage.", rating:4.6, runs:15000, gradient:"linear-gradient(135deg,#EE7CB8,#F26B6B)", iconName:"smile", category:"Writing", lastUsed:null },
    { id:"a6", name:"Forge", role:"Workflow Builder", desc:"Chains multiple agents into reliable automations — no code, just plain-English specs.", rating:4.9, runs:3200, gradient:"linear-gradient(135deg,#F0A23A,#D7FE4F)", iconName:"settings", category:"Coding", lastUsed:null }
  ];
}

function seedTopics() {
  return [
    { id:"t1", name:"Work Projects", icon:"briefcase", color:"#6BD68A", page:"projects", filter:"active" },
    { id:"t2", name:"Personal Projects", icon:"user", color:"#7C6BF4", page:"projects", filter:"all" },
    { id:"t3", name:"Plan Trip", icon:"ticket", color:"#4DD0C7", page:"calendar", filter:"all" },
    { id:"t4", name:"Agents Memory", icon:"pie", color:"#9B6BE0", page:"agents", filter:"all" },
    { id:"t5", name:"Youtube Planning", icon:"video", color:"#F26B6B", page:"tasks", filter:"upcoming" },
    { id:"t6", name:"Portfolio Tasks", icon:"file", color:"#F0A23A", page:"tasks", filter:"today" }
  ];
}

function seedTasks() {
  const today = TODAY_ISO;
  const tomorrow = isoKey(new Date(Date.now()+86400000));
  const dayAfter = isoKey(new Date(Date.now()+172800000));
  const yest = isoKey(new Date(Date.now()-86400000));
  return [
    { id:"tk1", title:"Review Q3 launch announcement video draft", project:"Q3 Campaign", pFg:"#B47318", pBg:"#FDF1DA", time:"10:30 AM", priority:"high", assignee:"MW", assigneeCls:"av-1", done:false, date:today, createdAt:Date.now()-3600000 },
    { id:"tk2", title:"Pair with Marvin on agent orchestration retries", project:"Orchestration Engine", pFg:"#2D8A4D", pBg:"#E5F8EA", time:"11:00 AM", priority:"high", assignee:"MM", assigneeCls:"av-7", done:false, date:today, createdAt:Date.now()-7200000 },
    { id:"tk3", title:"Coffee with Courtney to align on design tokens", project:"Design System", pFg:"#7C6BF4", pBg:"#EDEAFE", time:"9:00 AM", priority:"med", assignee:"CH", assigneeCls:"av-2", done:true, date:today, createdAt:Date.now()-10800000 },
    { id:"tk4", title:"Send onboarding follow-up to 12 new beta testers", project:"Beta Program", pFg:"#B73E3E", pBg:"#FCE5E5", time:"1:00 PM", priority:"med", assignee:"DR", assigneeCls:"av-5", done:false, date:today, createdAt:Date.now()-14400000 },
    { id:"tk5", title:'Draft outline for "Building Agent Workflows" blog post', project:"Content", pFg:"#B47318", pBg:"#FDF1DA", time:"3:30 PM", priority:"low", assignee:"MW", assigneeCls:"av-1", done:false, date:today, createdAt:Date.now()-18000000 },
    { id:"tk6", title:"Plan next week's user research interview slots", project:"User Study", pFg:"#2A9489", pBg:"#E0F7F5", time:"4:00 PM", priority:"low", assignee:"DR", assigneeCls:"av-4", done:false, date:today, createdAt:Date.now()-21600000 },
    { id:"tk7", title:"Review weekly metrics dashboard before EOD", project:"Internal", pFg:"#6C3AA8", pBg:"#F0E5FA", time:"5:30 PM", priority:"low", assignee:"MW", assigneeCls:"av-8", done:false, date:today, createdAt:Date.now()-25200000 },
    { id:"tk8", title:"Q3 Launch announcement publish", project:"Q3 Campaign", pFg:"#B47318", pBg:"#FDF1DA", time:"9:00 AM", priority:"high", assignee:"CH", assigneeCls:"av-2", done:false, date:tomorrow, createdAt:Date.now()-28800000 },
    { id:"tk9", title:"Review eng OKRs for next quarter", project:"Internal", pFg:"#6C3AA8", pBg:"#F0E5FA", time:"2:00 PM", priority:"med", assignee:"MM", assigneeCls:"av-3", done:false, date:dayAfter, createdAt:Date.now()-32400000 },
    { id:"tk10", title:"Update onboarding email copy", project:"Content", pFg:"#B47318", pBg:"#FDF1DA", time:"11:00 AM", priority:"med", assignee:"MM", assigneeCls:"av-3", done:false, date:yest, createdAt:Date.now()-36000000 }
  ];
}

function seedEvents() {
  const events = {};
  const add = (offset, ev) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const k = isoKey(d);
    events[k] = events[k] || [];
    events[k].push(ev);
  };
  add(0, { id:"e1", title:"Standup", bg:"#EDEAFE", fg:"#7C6BF4", time:"9:00 AM", meta:"15 min · 8 attendees" });
  add(0, { id:"e2", title:"Video Review", bg:"#FDF1DA", fg:"#B47318", time:"10:30 AM", meta:"45 min · Conf Room A" });
  add(0, { id:"e3", title:"Pair w/ Marvin", bg:"#E5F8EA", fg:"#2D8A4D", time:"11:30 AM", meta:"1 hr · Orchestration retries" });
  add(0, { id:"e4", title:"Beta Tester Follow-ups", bg:"#FCE5E5", fg:"#B73E3E", time:"1:00 PM", meta:"Focus block · 45 min" });
  add(0, { id:"e5", title:"Coffee w/ Courtney", bg:"#E0F7F5", fg:"#2A9489", time:"3:30 PM", meta:"30 min · Off-site" });
  add(1, { id:"e6", title:"Engineering Sync", bg:"#E5F8EA", fg:"#2D8A4D", time:"10:00 AM", meta:"1 hr · Team-wide" });
  add(2, { id:"e7", title:"Q3 Launch 🚀", bg:"#FDF1DA", fg:"#B47318", time:"All Day", meta:"Public" });
  add(4, { id:"e8", title:"Sprint Retro", bg:"#FCE5E5", fg:"#B73E3E", time:"3:00 PM", meta:"1 hr" });
  add(6, { id:"e9", title:"Design Ship", bg:"#EDEAFE", fg:"#7C6BF4", time:"All Day", meta:"Milestone" });
  add(-1, { id:"e10", title:"Demo Day", bg:"#FDF1DA", fg:"#B47318", time:"2:00 PM", meta:"Demos to leadership" });
  add(-3, { id:"e11", title:"Roadmap Review", bg:"#F0E5FA", fg:"#6C3AA8", time:"11:00 AM", meta:"Q3 planning" });
  add(8, { id:"e12", title:"User Interview", bg:"#E0F7F5", fg:"#2A9489", time:"2:00 PM", meta:"Beta cohort" });
  add(11, { id:"e13", title:"Team Lunch", bg:"#F0E5FA", fg:"#6C3AA8", time:"12:00 PM", meta:"Sushi spot" });
  add(13, { id:"e14", title:"Code Freeze", bg:"#E5F8EA", fg:"#2D8A4D", time:"All Day", meta:"Pre-release" });
  return events;
}

function seedActivity() {
  return [
    { id:"ac1", text:"<strong>Courtney</strong> completed <strong>\"Auth flow review\"</strong> in Design System Refresh", dot:"#6BD68A", at:Date.now()-12*60000 },
    { id:"ac2", text:"<strong>Marvin</strong> opened a PR on <strong>Agent Orchestration Engine</strong>", dot:"#7C6BF4", at:Date.now()-60*60000 },
    { id:"ac3", text:"<strong>Dianne</strong> shipped the Q3 announcement video draft", dot:"#F0A23A", at:Date.now()-3*60*60000 },
    { id:"ac4", text:"<strong>Max</strong> scheduled 4 user interviews for next week", dot:"#4DD0C7", at:Date.now()-26*60*60000 },
    { id:"ac5", text:"<strong>JD</strong> flagged a blocker on <strong>iOS Voice Companion</strong>", dot:"#F26B6B", at:Date.now()-30*60*60000 }
  ];
}

const PALETTE = [
  { c:"#7C6BF4", bg:"#EDEAFE", fg:"#7C6BF4" },
  { c:"#6BD68A", bg:"#E5F8EA", fg:"#2D8A4D" },
  { c:"#F0A23A", bg:"#FDF1DA", fg:"#B47318" },
  { c:"#4DD0C7", bg:"#E0F7F5", fg:"#2A9489" },
  { c:"#F26B6B", bg:"#FCE5E5", fg:"#B73E3E" },
  { c:"#9B6BE0", bg:"#F0E5FA", fg:"#6C3AA8" }
];

/* =================================================================
   STORAGE HOOK
   ================================================================= */
function usePersist(key, initial) {
  const [value, setValueState] = useState(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await window.storage.get(key);
        if (mounted && r && r.value) setValueState(JSON.parse(r.value));
      } catch (e) { /* not found */ }
      if (mounted) setReady(true);
    })();
    return () => { mounted = false; };
  }, [key]);
  const setValue = useCallback((updater) => {
    setValueState(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      try { window.storage.set(key, JSON.stringify(next)).catch(() => {}); } catch(e) {}
      return next;
    });
  }, [key]);
  return [value, setValue, ready];
}

/* =================================================================
   ICON HELPERS
   ================================================================= */
function TopicIcon({ name, color, size = 42 }) {
  const props = { size, color, strokeWidth: 1.6 };
  switch (name) {
    case "briefcase": return <Briefcase {...props} />;
    case "user": return <User {...props} />;
    case "ticket": return <Ticket {...props} />;
    case "pie": return <PieChart {...props} />;
    case "video": return <Video {...props} />;
    case "file": return <FileText {...props} />;
    default: return <Briefcase {...props} />;
  }
}

function AgentIcon({ name }) {
  const props = { size: 22, color: "white", strokeWidth: 1.8 };
  switch (name) {
    case "pencil": return <Pencil {...props} />;
    case "code": return <Code {...props} />;
    case "folder": return <FileText {...props} />;
    case "bar": return <BarChart3 {...props} />;
    case "smile": return <Smile {...props} />;
    case "settings": return <Settings {...props} />;
    default: return <Sparkles {...props} />;
  }
}

/* =================================================================
   MODAL
   ================================================================= */
function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3 className="modal-title">{title}</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* =================================================================
   SHELL: RAIL + SIDEBAR
   ================================================================= */
function Rail({ page, setPage }) {
  const items = [
    { k: "home", icon: Home },
    { k: "projects", icon: Briefcase },
    { k: "agents", icon: Users },
    { k: "tasks", icon: CheckSquare },
    { k: "calendar", icon: Calendar }
  ];
  return (
    <aside className="rail">
      <div className="rail-logo">ai</div>
      {items.map(({k, icon: Ico}) => (
        <button key={k} className={`rail-btn${page === k ? " is-active" : ""}`} onClick={() => setPage(k)}>
          <Ico size={20} strokeWidth={1.8} />
        </button>
      ))}
      <div className="rail-spacer" />
      <div className="rail-avatar">MW</div>
      <button className="rail-btn"><LogOut size={20} strokeWidth={1.8} /></button>
      <button className="rail-btn"><Moon size={20} strokeWidth={1.8} /></button>
    </aside>
  );
}

function Sidebar({ page, setPage, taskCount, theme, setTheme }) {
  const items = [
    { k: "home", label: "Home", icon: Home },
    { k: "projects", label: "Projects", icon: Briefcase, chevron: true },
    { k: "agents", label: "Agents", icon: Users },
    { k: "tasks", label: "Tasks", icon: CheckSquare, dot: taskCount > 0 },
    { k: "calendar", label: "Calendar", icon: Calendar }
  ];
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-name">Agent<span className="ai-accent">.ai</span></div>
        <button className="brand-collapse"><ChevronLeft size={14} strokeWidth={2.2} /></button>
      </div>
      <nav className="nav">
        {items.map(({k, label, icon: Ico, chevron, dot}) => (
          <button key={k} className={`nav-item${page === k ? " is-active" : ""}`} onClick={() => setPage(k)}>
            <Ico size={18} strokeWidth={1.8} />
            {label}
            {dot && <span className="dot" />}
            {chevron && <ChevronDown className="chevron" size={14} strokeWidth={2} />}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="secondary-links">
          <a>Settings</a><a>Support</a><a>FAQ</a>
        </div>
        <div className="profile-card">
          <div className="avatar">MW</div>
          <div className="profile-meta">
            <div className="profile-name">Max Wilsom <span className="pro-badge">Pro</span></div>
            <div className="profile-email">maxwilson@gmail.com</div>
          </div>
        </div>
        <div className="controls">
          <button className="ctrl"><LogOut size={14} strokeWidth={1.8} />Log Out</button>
          <div className="ctrl theme-switch">
            <div className={`theme-opt${theme === "light" ? " is-active" : ""}`} onClick={() => setTheme("light")}>
              <Sun size={12} strokeWidth={2} />Light
            </div>
            <div className={`theme-opt${theme === "dark" ? " is-active" : ""}`} onClick={() => setTheme("dark")}>
              <Moon size={12} strokeWidth={2} />Dark
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

/* =================================================================
   HOME PAGE
   ================================================================= */
function HomePage({ setPage, topics, setTopics, projects, tasks }) {
  const [addOpen, setAddOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const counts = useMemo(() => {
    const c = {};
    c.t1 = projects.filter(p => p.status === "active").length;
    c.t2 = projects.length;
    c.t3 = 14;
    c.t4 = 2;
    c.t5 = tasks.filter(t => !t.done && t.date > TODAY_ISO).length;
    c.t6 = tasks.filter(t => !t.done && t.date === TODAY_ISO).length;
    return c;
  }, [projects, tasks]);

  const handleTopicClick = (topic) => setPage(topic.page);
  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  };

  return (
    <>
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">With What You Want To Work Today?</h1>
            <p className="page-sub">Choose Topic From List Below Or Create New Shortcut</p>
          </div>
          <button className="add-btn" onClick={() => setAddOpen(true)}><Plus size={20} strokeWidth={2} /></button>
        </div>
        <div className="cards">
          {topics.map(t => (
            <article key={t.id} className="topic-card" onClick={() => handleTopicClick(t)}>
              <div className="topic-icon"><TopicIcon name={t.icon} color={t.color} /></div>
              <div className="topic-name">{t.name}</div>
              <div className="topic-meta">{counts[t.id] ?? 0} {counts[t.id] === 1 ? "File" : "Files"}</div>
            </article>
          ))}
        </div>
        <section className="cta">
          <svg className="cta-waves" viewBox="0 0 600 240" preserveAspectRatio="none">
            <defs>
              <linearGradient id="waveGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#4a4d75" stopOpacity="0.4"/>
                <stop offset="100%" stopColor="#1B1D33" stopOpacity="0"/>
              </linearGradient>
            </defs>
            <path d="M0,120 Q150,60 300,120 T600,100 L600,240 L0,240 Z" fill="url(#waveGrad)"/>
            <path d="M0,160 Q150,100 300,150 T600,140 L600,240 L0,240 Z" fill="url(#waveGrad)" opacity="0.7"/>
            <path d="M0,200 Q150,160 300,190 T600,180 L600,240 L0,240 Z" fill="url(#waveGrad)" opacity="0.5"/>
          </svg>
          <h2 className="cta-title">Start Instantly With Free <span className="lime">AI Templates.</span></h2>
          <p className="cta-sub">Check Our Free Library Of Templates For Any Purpose</p>
          <form className="cta-search" onSubmit={e => e.preventDefault()}>
            <div className="cta-input">
              <Search size={16} strokeWidth={1.8} style={{opacity:.6}} />
              <input type="text" placeholder="Type A Keyword..." />
            </div>
            <button className="cta-btn">Search</button>
          </form>
        </section>
      </main>
      <aside className="feed">
        <div className="feed-head">
          <div>
            <h2 className="feed-title">Feed</h2>
            <p className="feed-sub">Get New Updates Every Day</p>
          </div>
          <button className={`refresh-btn${refreshing ? " spinning" : ""}`} onClick={handleRefresh}>
            <RefreshCw size={13} strokeWidth={2.2} />Refresh
          </button>
        </div>
        <div className="promo">
          <h3 className="promo-title">New Features Is Coming</h3>
          <p className="promo-sub">Check Our Blog</p>
          <button className="promo-btn">Open Now</button>
        </div>
        <h4 className="blog-heading">New In Blog From Users</h4>
        <div className="blog-list">
          {[
            { i:"MW", c:"av-1", n:"Max Wilsom", d:"Some Description", t:"Hi! Today I want to share how to make best template to make UX work much faster", l:1524 },
            { i:"CH", c:"av-2", n:"Courtney Henry", d:"Some Description", t:"AI Agents: Bridging The Gap Between Human Capability And Machine Power", l:25 },
            { i:"MM", c:"av-3", n:"Marvin McKinney", d:"Some Description", t:"Meet Your AI Agent: Pioneering The Future Of Automation", l:56 },
            { i:"DR", c:"av-4", n:"Dianne Russell", d:"Some Description", t:"Designing Agentic Workflows: From Prompt To Production In Minutes", l:89 }
          ].map((b, idx) => (
            <article key={idx} className="blog-card">
              <div className="blog-author">
                <div className={`blog-avatar ${b.c}`}>{b.i}</div>
                <div className="blog-author-meta">
                  <div className="blog-author-name">{b.n}</div>
                  <div className="blog-author-desc">{b.d}</div>
                </div>
                <button className="blog-more"><MoreHorizontal size={14} /></button>
              </div>
              <p className="blog-text">{b.t}</p>
              <div className="blog-foot">
                <div className="blog-stat"><Heart size={14} strokeWidth={1.8} /></div>
                <div className="blog-stat"><MessageCircle size={14} strokeWidth={1.8} />{b.l}</div>
                <button className="open-btn">Open</button>
              </div>
            </article>
          ))}
        </div>
      </aside>
      <AddTopicModal open={addOpen} onClose={() => setAddOpen(false)} onAdd={t => setTopics(ts => [...ts, t])} />
    </>
  );
}

function AddTopicModal({ open, onClose, onAdd }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("briefcase");
  const [colorIdx, setColorIdx] = useState(0);
  const [page, setPageType] = useState("projects");
  const submit = () => {
    if (!name.trim()) return;
    onAdd({ id:`t${Date.now()}`, name:name.trim(), icon, color:PALETTE[colorIdx].c, page, filter:"all" });
    setName(""); setIcon("briefcase"); setColorIdx(0); setPage("projects"); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="New Topic">
      <div className="field">
        <label>NAME</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Mobile App Tasks" autoFocus />
      </div>
      <div className="field-row">
        <div className="field">
          <label>ICON</label>
          <select value={icon} onChange={e => setIcon(e.target.value)}>
            <option value="briefcase">Work</option>
            <option value="user">Personal</option>
            <option value="ticket">Travel</option>
            <option value="pie">Memory</option>
            <option value="video">Media</option>
            <option value="file">Files</option>
          </select>
        </div>
        <div className="field">
          <label>OPENS</label>
          <select value={page} onChange={e => setPageType(e.target.value)}>
            <option value="projects">Projects</option>
            <option value="tasks">Tasks</option>
            <option value="calendar">Calendar</option>
            <option value="agents">Agents</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>COLOR</label>
        <div className="color-row">
          {PALETTE.map((p, i) => (
            <div key={i} className={`color-swatch${colorIdx === i ? " is-selected" : ""}`} style={{background:p.c}} onClick={() => setColorIdx(i)} />
          ))}
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit}>Add Topic</button>
      </div>
    </Modal>
  );
}

/* =================================================================
   PROJECTS PAGE
   ================================================================= */
function ProjectsPage({ projects, setProjects, activity }) {
  const [filter, setFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const filtered = useMemo(() => {
    if (filter === "all") return projects;
    if (filter === "completed") return projects.filter(p => p.progress >= 100);
    return projects.filter(p => p.status === filter);
  }, [projects, filter]);
  const counts = {
    all: projects.length,
    active: projects.filter(p => p.status === "active").length,
    hold: projects.filter(p => p.status === "hold").length,
    completed: projects.filter(p => p.progress >= 100).length
  };
  const stats = {
    active: counts.active,
    onSchedule: projects.length ? Math.round((projects.filter(p => p.progress >= 50).length / projects.length) * 100) : 0,
    team: 24,
    overdue: 3
  };
  const removeProject = (id, e) => {
    e.stopPropagation();
    setProjects(ps => ps.filter(p => p.id !== id));
  };
  return (
    <>
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Projects</h1>
            <p className="page-sub">Track Every Initiative From Kickoff To Delivery</p>
          </div>
          <button className="add-btn" onClick={() => setAddOpen(true)}><Plus size={20} strokeWidth={2} /></button>
        </div>
        <div className="pill-row">
          {[
            {k:"all",l:"All"},{k:"active",l:"Active"},{k:"hold",l:"On Hold"},{k:"completed",l:"Completed"}
          ].map(p => (
            <button key={p.k} className={`pill${filter === p.k ? " is-active" : ""}`} onClick={() => setFilter(p.k)}>
              {p.l} <span className="count">{counts[p.k]}</span>
            </button>
          ))}
        </div>
        <div className="proj-grid">
          {filtered.length === 0 && (
            <div style={{gridColumn:"1 / -1", textAlign:"center", padding:"40px", color:"var(--text-500)"}}>
              No projects in this view. Try adding one!
            </div>
          )}
          {filtered.map(p => (
            <article key={p.id} className="proj-card">
              <div className="proj-stripe" style={{background:p.color}} />
              <div className="proj-top">
                <span className="proj-tag" style={{background:p.tagBg, color:p.tagFg}}>{p.category}</span>
                <button className="proj-delete" onClick={e => removeProject(p.id, e)}><Trash2 size={14} strokeWidth={1.8} /></button>
              </div>
              <h3 className="proj-name">{p.name}</h3>
              <p className="proj-desc">{p.desc}</p>
              <div className="proj-progress">
                <div className="proj-progress-head"><span>Progress</span><span>{p.progress}%</span></div>
                <div className="proj-progress-bar"><div className="proj-progress-fill" style={{width:`${p.progress}%`, background:p.color}} /></div>
              </div>
              <div className="proj-foot">
                <div className="avatar-stack">
                  {p.team.map((m, i) => <div key={i} className={`avatar ${m.cls}`}>{m.i}</div>)}
                  {p.teamMore > 0 && <div className="avatar more">+{p.teamMore}</div>}
                </div>
                <div className="proj-due"><Calendar size={13} strokeWidth={2} />{p.due}</div>
              </div>
            </article>
          ))}
        </div>
      </main>
      <aside className="feed">
        <div className="feed-head">
          <div>
            <h2 className="feed-title">Overview</h2>
            <p className="feed-sub">Last 30 days</p>
          </div>
        </div>
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">Active Projects</div><div className="stat-val">{stats.active}</div><div className="stat-delta">↑ live count</div></div>
          <div className="stat-card"><div className="stat-label">On Schedule</div><div className="stat-val">{stats.onSchedule}%</div><div className="stat-delta">↑ 4% vs last</div></div>
          <div className="stat-card"><div className="stat-label">Team Members</div><div className="stat-val">{stats.team}</div><div className="stat-delta">+2 onboarding</div></div>
          <div className="stat-card"><div className="stat-label">Overdue</div><div className="stat-val">{stats.overdue}</div><div className="stat-delta neg">↓ 2 from last</div></div>
        </div>
        <div className="activity">
          <h3 className="upcoming-title" style={{marginBottom:"14px"}}>Recent Activity</h3>
          <div className="activity-list">
            {activity.map(a => (
              <div key={a.id} className="activity-item">
                <div className="activity-dot" style={{background:a.dot}} />
                <div className="activity-meta">
                  <p className="activity-text" dangerouslySetInnerHTML={{__html:a.text}} />
                  <div className="activity-time">{timeAgo(new Date(a.at).toISOString())}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>
      <AddProjectModal open={addOpen} onClose={() => setAddOpen(false)} onAdd={p => setProjects(ps => [p, ...ps])} />
    </>
  );
}

function AddProjectModal({ open, onClose, onAdd }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState("Design");
  const [colorIdx, setColorIdx] = useState(0);
  const [due, setDue] = useState("");
  const submit = () => {
    if (!name.trim()) return;
    const p = PALETTE[colorIdx];
    onAdd({
      id:`p${Date.now()}`,
      name:name.trim(),
      desc:desc.trim() || "No description yet.",
      category,
      color:p.c, tagFg:p.fg, tagBg:p.bg,
      progress:0,
      due:due || "TBD",
      team:[{i:"MW",cls:"av-1"}],
      teamMore:0,
      status:"active"
    });
    setName(""); setDesc(""); setCategory("Design"); setColorIdx(0); setDue(""); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="New Project">
      <div className="field">
        <label>NAME</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Marketing Site Redesign" autoFocus />
      </div>
      <div className="field">
        <label>DESCRIPTION</label>
        <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="What's this project about?" />
      </div>
      <div className="field-row">
        <div className="field">
          <label>CATEGORY</label>
          <select value={category} onChange={e => setCategory(e.target.value)}>
            <option>Design</option><option>Engineering</option><option>Marketing</option>
            <option>Research</option><option>Mobile</option><option>Internal</option>
          </select>
        </div>
        <div className="field">
          <label>DUE DATE</label>
          <input value={due} onChange={e => setDue(e.target.value)} placeholder="May 30" />
        </div>
      </div>
      <div className="field">
        <label>COLOR</label>
        <div className="color-row">
          {PALETTE.map((p, i) => (
            <div key={i} className={`color-swatch${colorIdx === i ? " is-selected" : ""}`} style={{background:p.c}} onClick={() => setColorIdx(i)} />
          ))}
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit}>Create Project</button>
      </div>
    </Modal>
  );
}

/* =================================================================
   AGENTS PAGE
   ================================================================= */
function AgentsPage({ agents, setAgents }) {
  const [filter, setFilter] = useState("all");
  const [pulse, setPulse] = useState(null);
  const filtered = useMemo(() => {
    if (filter === "all") return agents;
    return agents.filter(a => a.category === filter);
  }, [agents, filter]);
  const featured = agents.find(a => a.featured) || agents[0];
  const recentlyUsed = useMemo(() => {
    return agents.filter(a => a.lastUsed).sort((a,b) => b.lastUsed - a.lastUsed).slice(0, 3);
  }, [agents]);
  const useAgent = (id) => {
    setAgents(arr => arr.map(a => a.id === id ? { ...a, runs:a.runs+1, lastUsed:Date.now() } : a));
    setPulse(id);
    setTimeout(() => setPulse(null), 600);
  };
  const totalRuns = agents.reduce((s, a) => s + a.runs, 0);
  const avgRating = (agents.reduce((s, a) => s + a.rating, 0) / agents.length).toFixed(1);
  return (
    <>
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">AI Agents</h1>
            <p className="page-sub">Your Specialized Workforce — Pick One Or Build Your Own</p>
          </div>
          <button className="add-btn"><Plus size={20} strokeWidth={2} /></button>
        </div>
        {featured && (
          <section className="agent-featured">
            <div className="agent-featured-meta">
              <span className="agent-featured-tag">Featured Today</span>
              <h2 className="agent-featured-title">{featured.name} — Your Research Companion</h2>
              <p className="agent-featured-desc">{featured.desc}</p>
              <button className="agent-featured-cta" onClick={() => useAgent(featured.id)}>
                Start Chatting <ArrowRight size={14} strokeWidth={2.2} />
              </button>
            </div>
            <div className="agent-orb"><div className="agent-orb-bg" /></div>
          </section>
        )}
        <div className="pill-row">
          {[
            {k:"all",l:"All", c:agents.length},
            {k:"Writing",l:"Writing"},{k:"Research",l:"Research"},
            {k:"Coding",l:"Coding"},{k:"Design",l:"Design"},{k:"Marketing",l:"Marketing"}
          ].map(p => (
            <button key={p.k} className={`pill${filter === p.k ? " is-active" : ""}`} onClick={() => setFilter(p.k)}>
              {p.l}{p.c !== undefined && <span className="count">{p.c}</span>}
            </button>
          ))}
        </div>
        <div className="agent-grid">
          {filtered.length === 0 && (
            <div style={{gridColumn:"1 / -1", textAlign:"center", padding:"40px", color:"var(--text-500)"}}>
              No agents in this category yet.
            </div>
          )}
          {filtered.map(a => (
            <article key={a.id} className="agent-card" style={pulse === a.id ? {transform:"scale(1.02)"} : null}>
              <div className="agent-avatar" style={{background:a.gradient}}>
                <AgentIcon name={a.iconName} />
              </div>
              <div className="agent-name">{a.name}</div>
              <div className="agent-role">{a.role}</div>
              <p className="agent-desc">{a.desc}</p>
              <div className="agent-stats">
                <div className="agent-stat-group">
                  <div className="agent-stat"><Star size={11} fill="currentColor" /><strong>{a.rating}</strong></div>
                  <div className="agent-stat">{(a.runs/1000).toFixed(1)}k runs</div>
                </div>
                <button className="agent-use-btn" onClick={() => useAgent(a.id)}>Use</button>
              </div>
            </article>
          ))}
        </div>
      </main>
      <aside className="feed">
        <div className="feed-head">
          <div>
            <h2 className="feed-title">Performance</h2>
            <p className="feed-sub">Your agents this week</p>
          </div>
        </div>
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">Total Runs</div><div className="stat-val">{totalRuns.toLocaleString()}</div><div className="stat-delta">↑ 18% vs last</div></div>
          <div className="stat-card"><div className="stat-label">Avg Rating</div><div className="stat-val">{avgRating}</div><div className="stat-delta">↑ 0.2</div></div>
        </div>
        <div className="week-chart" style={{marginBottom:"14px"}}>
          <div className="week-chart-title">Runs This Week</div>
          <div className="bars">
            {[45,70,55,85,65,95,30].map((h, i) => {
              const todayDow = new Date().getDay();
              return (
                <div key={i} className="bar-col">
                  <div className={`bar${i === todayDow ? " is-today" : ""}`} style={{height:`${h}%`}} />
                  <div className="bar-label">{WEEKDAY_SHORT[i].slice(0,3)}</div>
                </div>
              );
            })}
          </div>
        </div>
        <h4 className="blog-heading">Recently Used</h4>
        <div className="blog-list">
          {recentlyUsed.length === 0 && <div style={{padding:"14px", color:"var(--text-500)", fontSize:"13px"}}>Use an agent to see it here.</div>}
          {recentlyUsed.map(a => (
            <article key={a.id} className="blog-card">
              <div className="blog-author">
                <div className="agent-avatar" style={{width:36, height:36, borderRadius:"50%", fontSize:14, margin:0, background:a.gradient}}>
                  <AgentIcon name={a.iconName} />
                </div>
                <div className="blog-author-meta">
                  <div className="blog-author-name">{a.name}</div>
                  <div className="blog-author-desc">{a.role} · {timeAgo(new Date(a.lastUsed).toISOString())}</div>
                </div>
                <button className="open-btn" onClick={() => useAgent(a.id)}>Reuse</button>
              </div>
            </article>
          ))}
        </div>
      </aside>
    </>
  );
}

/* =================================================================
   TASKS PAGE
   ================================================================= */
function TasksPage({ tasks, setTasks, projects }) {
  const [tab, setTab] = useState("today");
  const [quickAdd, setQuickAdd] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [timerSec, setTimerSec] = useState(25*60);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => {
        setTimerSec(s => {
          if (s <= 1) { setTimerRunning(false); return 25*60; }
          return s - 1;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning]);

  const counts = useMemo(() => ({
    today: tasks.filter(t => t.date === TODAY_ISO && !t.done).length,
    upcoming: tasks.filter(t => t.date > TODAY_ISO).length,
    overdue: tasks.filter(t => t.date < TODAY_ISO && !t.done).length,
    completed: tasks.filter(t => t.done).length
  }), [tasks]);

  const filtered = useMemo(() => {
    if (tab === "today") return tasks.filter(t => t.date === TODAY_ISO).sort((a,b) => Number(a.done) - Number(b.done));
    if (tab === "upcoming") return tasks.filter(t => t.date > TODAY_ISO).sort((a,b) => a.date.localeCompare(b.date));
    if (tab === "overdue") return tasks.filter(t => t.date < TODAY_ISO && !t.done);
    return tasks.filter(t => t.done).sort((a,b) => b.createdAt - a.createdAt);
  }, [tasks, tab]);

  const todayTotal = tasks.filter(t => t.date === TODAY_ISO).length;
  const todayDone = tasks.filter(t => t.date === TODAY_ISO && t.done).length;
  const ringPct = todayTotal ? Math.round((todayDone/todayTotal)*100) : 0;
  const ringOffset = 364 - (364 * ringPct/100);

  const toggleDone = (id) => setTasks(ts => ts.map(t => t.id === id ? {...t, done:!t.done} : t));
  const deleteTask = (id, e) => { e.stopPropagation(); setTasks(ts => ts.filter(t => t.id !== id)); };

  const submitQuick = () => {
    if (!quickAdd.trim()) return;
    setTasks(ts => [{
      id:`tk${Date.now()}`,
      title:quickAdd.trim(),
      project:"Inbox", pFg:"#7C6BF4", pBg:"#EDEAFE",
      time:"",
      priority:"low",
      assignee:"MW", assigneeCls:"av-1",
      done:false,
      date:TODAY_ISO,
      createdAt:Date.now()
    }, ...ts]);
    setQuickAdd("");
  };

  const fmtTimer = (s) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  return (
    <>
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Tasks</h1>
            <p className="page-sub">{relativeDay(TODAY_ISO)}, {MONTH_SHORT[todayDate.getMonth()]} {todayDate.getDate()} · {counts.today} Tasks Due Today</p>
          </div>
          <button className="add-btn" onClick={() => setAddOpen(true)}><Plus size={20} strokeWidth={2} /></button>
        </div>
        <div className="task-quickadd">
          <button className="task-quickadd-icon" onClick={submitQuick}><Plus size={16} strokeWidth={2.4} /></button>
          <input
            value={quickAdd}
            onChange={e => setQuickAdd(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submitQuick()}
            placeholder="Add a new task and press Enter…"
          />
          <button className="open-btn" onClick={submitQuick}>⏎ Quick Add</button>
        </div>
        <div className="tabs">
          {[
            {k:"today",l:"Today"},{k:"upcoming",l:"Upcoming"},{k:"overdue",l:"Overdue"},{k:"completed",l:"Completed"}
          ].map(t => (
            <button key={t.k} className={`tab${tab === t.k ? " is-active" : ""}`} onClick={() => setTab(t.k)}>
              {t.l}<span className="count">{counts[t.k]}</span>
            </button>
          ))}
        </div>
        <div className="task-list">
          {filtered.length === 0 && (
            <div className="task-empty">
              {tab === "completed" ? "No completed tasks yet. Get to it!" : tab === "overdue" ? "Nothing overdue. You're on top of things." : "Empty here. Add a task above."}
            </div>
          )}
          {filtered.map(t => (
            <div key={t.id} className={`task-row${t.done ? " is-done" : ""}`} onClick={() => toggleDone(t.id)}>
              <div className={`task-check${t.done ? " is-checked" : ""}`}>
                {t.done && <Check size={12} strokeWidth={3} />}
              </div>
              <div className={`task-priority p-${t.priority}`} />
              <div className="task-body">
                <div className="task-title">{t.title}</div>
                <div className="task-meta-row">
                  <span className="task-project" style={{background:t.pBg, color:t.pFg}}>{t.project}</span>
                  {t.time && <span className="task-time"><Clock size={11} strokeWidth={2} />{t.time}</span>}
                  {tab !== "today" && <span className="task-time">{relativeDay(t.date)}</span>}
                </div>
              </div>
              <div className={`task-assignee ${t.assigneeCls}`}>{t.assignee}</div>
              <button className="task-delete" onClick={e => deleteTask(t.id, e)}><Trash2 size={14} strokeWidth={1.8} /></button>
            </div>
          ))}
        </div>
      </main>
      <aside className="feed">
        <div className="feed-head">
          <div>
            <h2 className="feed-title">Today</h2>
            <p className="feed-sub">Your daily focus</p>
          </div>
        </div>
        <div className="progress-ring-card">
          <div className="progress-ring">
            <svg width="140" height="140" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="58" fill="none" stroke="#ECECF1" strokeWidth="12" />
              <circle cx="70" cy="70" r="58" fill="none" stroke="url(#ringGrad)" strokeWidth="12" strokeLinecap="round" strokeDasharray="364" strokeDashoffset={ringOffset} transform="rotate(-90 70 70)" style={{transition:"stroke-dashoffset .6s ease-out"}} />
              <defs>
                <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#7C6BF4" />
                  <stop offset="100%" stopColor="#A99CFF" />
                </linearGradient>
              </defs>
            </svg>
            <div className="progress-ring-text">
              <div className="progress-ring-num">{ringPct}%</div>
              <div className="progress-ring-label">{todayDone} of {todayTotal} done</div>
            </div>
          </div>
          <div className="progress-ring-title">{ringPct >= 50 ? "You're On Track" : "Let's Get Going"}</div>
          <div className="progress-ring-sub">{todayTotal - todayDone === 0 ? "All done — go celebrate." : `${todayTotal - todayDone} task${todayTotal - todayDone === 1 ? "" : "s"} remaining`}</div>
        </div>
        <div className="week-chart">
          <div className="week-chart-title">This Week</div>
          <div className="bars">
            {WEEKDAY_SHORT.map((d, i) => {
              const todayDow = new Date().getDay();
              const h = i === todayDow ? Math.max(ringPct, 5) : i < todayDow ? [45,60,52,68,55,70][i % 6] : 0;
              return (
                <div key={i} className="bar-col">
                  <div className={`bar${i === todayDow ? " is-today" : ""}`} style={{height:`${h}%`, opacity:h === 0 ? .3 : 1}} />
                  <div className="bar-label">{d}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="focus-timer">
          <div className="focus-label">Focus Session</div>
          <div className="focus-time">{fmtTimer(timerSec)}</div>
          <button className="focus-btn" onClick={() => setTimerRunning(r => !r)}>
            {timerRunning ? "Pause" : "Start Pomodoro"}
          </button>
        </div>
      </aside>
      <AddTaskModal open={addOpen} onClose={() => setAddOpen(false)} onAdd={t => setTasks(ts => [t, ...ts])} projects={projects} />
    </>
  );
}

function AddTaskModal({ open, onClose, onAdd, projects }) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("med");
  const [time, setTime] = useState("");
  const [date, setDate] = useState(TODAY_ISO);
  const [projectIdx, setProjectIdx] = useState(0);
  const submit = () => {
    if (!title.trim()) return;
    const p = projects[projectIdx];
    onAdd({
      id:`tk${Date.now()}`,
      title:title.trim(),
      project:p ? p.name : "Inbox",
      pFg:p ? p.tagFg : "#7C6BF4",
      pBg:p ? p.tagBg : "#EDEAFE",
      time:time.trim(),
      priority,
      assignee:"MW", assigneeCls:"av-1",
      done:false,
      date,
      createdAt:Date.now()
    });
    setTitle(""); setPriority("med"); setTime(""); setDate(TODAY_ISO); setProjectIdx(0); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="New Task">
      <div className="field">
        <label>TITLE</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs doing?" autoFocus />
      </div>
      <div className="field-row">
        <div className="field">
          <label>PRIORITY</label>
          <select value={priority} onChange={e => setPriority(e.target.value)}>
            <option value="high">High</option>
            <option value="med">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div className="field">
          <label>TIME</label>
          <input value={time} onChange={e => setTime(e.target.value)} placeholder="2:30 PM" />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>DATE</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>PROJECT</label>
          <select value={projectIdx} onChange={e => setProjectIdx(Number(e.target.value))}>
            {projects.map((p, i) => <option key={p.id} value={i}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit}>Add Task</button>
      </div>
    </Modal>
  );
}

/* =================================================================
   CALENDAR PAGE
   ================================================================= */
function CalendarPage({ events, setEvents }) {
  const [year, setYear] = useState(todayDate.getFullYear());
  const [month, setMonth] = useState(todayDate.getMonth());
  const [view, setView] = useState("month");
  const [addOpen, setAddOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(TODAY_ISO);

  const grid = useMemo(() => getCalendarGrid(year, month), [year, month]);
  const todayEvents = events[TODAY_ISO] || [];

  const upcoming = useMemo(() => {
    const items = [];
    for (let i = 1; i <= 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const k = isoKey(d);
      if (events[k]) {
        events[k].forEach(ev => items.push({ ...ev, iso:k, d }));
      }
    }
    return items.slice(0, 5);
  }, [events]);

  const totalEvents = useMemo(() => {
    return Object.entries(events).reduce((s, [k, arr]) => {
      const d = new Date(k);
      return d.getFullYear() === year && d.getMonth() === month ? s + arr.length : s;
    }, 0);
  }, [events, year, month]);

  const prev = () => {
    if (month === 0) { setMonth(11); setYear(y => y-1); }
    else setMonth(m => m-1);
  };
  const next = () => {
    if (month === 11) { setMonth(0); setYear(y => y+1); }
    else setMonth(m => m+1);
  };
  const jumpToday = () => {
    setYear(todayDate.getFullYear());
    setMonth(todayDate.getMonth());
  };
  const openAdd = (iso) => { setSelectedDate(iso); setAddOpen(true); };

  return (
    <>
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">{MONTH_NAMES[month]} {year}</h1>
            <p className="page-sub">Your Month At A Glance — {totalEvents} Events Scheduled</p>
          </div>
          <button className="add-btn" onClick={() => openAdd(TODAY_ISO)}><Plus size={20} strokeWidth={2} /></button>
        </div>
        <div className="cal-toolbar">
          <button className="cal-nav-btn" onClick={prev}><ChevronLeft size={14} strokeWidth={2.2} /></button>
          <button className="cal-today-btn" onClick={jumpToday}>Today</button>
          <button className="cal-nav-btn" onClick={next}><ChevronRight size={14} strokeWidth={2.2} /></button>
          <div className="cal-view-toggle">
            {["Day","Week","Month"].map(v => (
              <button key={v} className={`cal-view-opt${view === v.toLowerCase() ? " is-active" : ""}`} onClick={() => setView(v.toLowerCase())}>{v}</button>
            ))}
          </div>
        </div>
        <div className="cal-grid">
          <div className="cal-week-head">
            {WEEKDAY_SHORT.map(d => <div key={d} className="cal-week-head-cell">{d}</div>)}
          </div>
          <div className="cal-body">
            {grid.map((d, i) => {
              const isToday = d.iso === TODAY_ISO;
              const dayEvents = events[d.iso] || [];
              const shown = dayEvents.slice(0, 2);
              const more = dayEvents.length - shown.length;
              return (
                <div key={i} className={`cal-day${d.other ? " is-other-month" : ""}${isToday ? " is-today" : ""}`} onClick={() => openAdd(d.iso)}>
                  <span className="cal-day-num">{d.day}</span>
                  {shown.map((e, idx) => (
                    <div key={idx} className="cal-event" style={{background:e.bg, color:e.fg}}>{e.title}</div>
                  ))}
                  {more > 0 && <div className="cal-event" style={{background:"var(--hairline)", color:"var(--text-700)"}}>+{more} more</div>}
                </div>
              );
            })}
          </div>
        </div>
      </main>
      <aside className="feed">
        <div className="feed-head">
          <div>
            <h2 className="feed-title">Today's Schedule</h2>
            <p className="feed-sub">{relativeDay(TODAY_ISO)}, {MONTH_SHORT[todayDate.getMonth()]} {todayDate.getDate()}</p>
          </div>
        </div>
        <div className="timeline">
          {todayEvents.length === 0 ? (
            <div className="timeline-empty">Nothing on the calendar today. Enjoy the breathing room.</div>
          ) : (
            <div className="timeline-list">
              {todayEvents.map(ev => (
                <div key={ev.id} className="timeline-item">
                  <div className="timeline-time">{ev.time}</div>
                  <div className="timeline-block" style={{background:ev.bg, borderColor:ev.fg}}>
                    <div className="timeline-block-title">{ev.title}</div>
                    <div className="timeline-block-meta">{ev.meta}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="upcoming-card">
          <h3 className="upcoming-title">Upcoming</h3>
          {upcoming.length === 0 && <div style={{padding:"14px 0", color:"var(--text-500)", fontSize:"13px"}}>Nothing scheduled yet.</div>}
          {upcoming.map((u, i) => (
            <div key={i} className="up-item">
              <div className="up-date">
                <div className="up-date-d">{u.d.getDate()}</div>
                <div className="up-date-m">{WEEKDAY_SHORT[u.d.getDay()]}</div>
              </div>
              <div className="up-body">
                <div className="up-name">{u.title}</div>
                <div className="up-time">{u.time} · {u.meta}</div>
              </div>
            </div>
          ))}
        </div>
      </aside>
      <AddEventModal open={addOpen} onClose={() => setAddOpen(false)} initialDate={selectedDate} onAdd={(iso, ev) => setEvents(es => ({...es, [iso]:[...(es[iso] || []), ev]}))} />
    </>
  );
}

function AddEventModal({ open, onClose, initialDate, onAdd }) {
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [meta, setMeta] = useState("");
  const [date, setDate] = useState(initialDate);
  const [colorIdx, setColorIdx] = useState(0);
  useEffect(() => { if (open) setDate(initialDate); }, [open, initialDate]);
  const submit = () => {
    if (!title.trim()) return;
    const p = PALETTE[colorIdx];
    onAdd(date, {
      id:`e${Date.now()}`,
      title:title.trim(),
      time:time.trim() || "All Day",
      meta:meta.trim() || "",
      bg:p.bg, fg:p.fg
    });
    setTitle(""); setTime(""); setMeta(""); setColorIdx(0); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="New Event">
      <div className="field">
        <label>TITLE</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Team standup" autoFocus />
      </div>
      <div className="field-row">
        <div className="field">
          <label>DATE</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>TIME</label>
          <input value={time} onChange={e => setTime(e.target.value)} placeholder="9:00 AM" />
        </div>
      </div>
      <div className="field">
        <label>DETAILS</label>
        <input value={meta} onChange={e => setMeta(e.target.value)} placeholder="Optional: location, duration, attendees" />
      </div>
      <div className="field">
        <label>COLOR</label>
        <div className="color-row">
          {PALETTE.map((p, i) => (
            <div key={i} className={`color-swatch${colorIdx === i ? " is-selected" : ""}`} style={{background:p.c}} onClick={() => setColorIdx(i)} />
          ))}
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit}>Add Event</button>
      </div>
    </Modal>
  );
}

/* =================================================================
   APP
   ================================================================= */
export default function App() {
  const [page, setPage] = usePersist("page", "home");
  const [theme, setTheme] = usePersist("theme", "dark");
  const [topics, setTopics] = usePersist("topics", seedTopics());
  const [projects, setProjects] = usePersist("projects", seedProjects());
  const [agents, setAgents] = usePersist("agents", seedAgents());
  const [tasks, setTasks] = usePersist("tasks", seedTasks());
  const [events, setEvents] = usePersist("events", seedEvents());
  const [activity] = usePersist("activity", seedActivity());

  const taskCount = useMemo(() => tasks.filter(t => t.date === TODAY_ISO && !t.done).length, [tasks]);

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <Rail page={page} setPage={setPage} />
        <Sidebar page={page} setPage={setPage} taskCount={taskCount} theme={theme} setTheme={setTheme} />
        {page === "home" && (
          <HomePage setPage={setPage} topics={topics} setTopics={setTopics} projects={projects} tasks={tasks} />
        )}
        {page === "projects" && (
          <ProjectsPage projects={projects} setProjects={setProjects} activity={activity} />
        )}
        {page === "agents" && (
          <AgentsPage agents={agents} setAgents={setAgents} />
        )}
        {page === "tasks" && (
          <TasksPage tasks={tasks} setTasks={setTasks} projects={projects} />
        )}
        {page === "calendar" && (
          <CalendarPage events={events} setEvents={setEvents} />
        )}
      </div>
    </>
  );
}
