import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { supabase } from "./supabaseClient";

// ─── Theme ────────────────────────────────────────────────────────────────────
const BG = "linear-gradient(160deg,#1a1035 0%,#0d1f3c 45%,#0a2a1f 100%)";

// ─── Gamification ─────────────────────────────────────────────────────────────
const RANKS = [
  {min:0,    label:"Rookie",  icon:"🧹", color:"#94a3b8"},
  {min:50,   label:"Cleaner", icon:"🪣", color:"#34d399"},
  {min:150,  label:"Pro",     icon:"⭐", color:"#fbbf24"},
  {min:300,  label:"Expert",  icon:"🔥", color:"#fb923c"},
  {min:500,  label:"Master",  icon:"💎", color:"#7163F3"},
  {min:1000, label:"Legend",  icon:"👑", color:"#e879f9"},
];
const ZONE_ACH = [
  {zone:"kitchen",  icon:"🍳", label:"Kitchen King"},
  {zone:"bathroom", icon:"🚿", label:"Bathroom Boss"},
  {zone:"living",   icon:"🛋️", label:"Living Pro"},
  {zone:"bedroom",  icon:"🛏️", label:"Bedroom Master"},
  {zone:"pets",     icon:"🐾", label:"Pet Champion"},
];
const getRank = pts => [...RANKS].reverse().find(r=>pts>=r.min) || RANKS[0];
const computePts = (tasks,pid) => tasks.reduce((s,t)=>s+(t.doneOn||[]).filter(e=>e.by===pid).length,0);
const getWeekStats = (tasks,pid,dates) => {
  let done=0,total=0;
  dates.forEach(d=>{
    const dt=tasks.filter(t=>isScheduledOnG(t,d));
    total+=dt.length;
    done+=dt.filter(t=>doneOnDateBy(t.doneOn,d,pid)).length;
  });
  return {done,total,pct:total===0?0:Math.round(done/total*100)};
};
const getZoneAch=(tasks,pid)=>ZONE_ACH.map(za=>({...za,ach:getZoneAchLevel(tasks,pid,za.zone)})).filter(z=>z.ach);

// Total completions (by anyone) across the household on a given set of dates
const totalCompletionsOn=(tasks,dates)=>{
  const dateSet=new Set(dates);
  return tasks.reduce((s,t)=>s+(t.doneOn||[]).filter(e=>dateSet.has(e.date)).length,0);
};
// Household-wide streak: consecutive days (ending yesterday or today) where
// every task scheduled that day was completed by someone.
const getHouseholdStreak=(tasks,ds,TODAY)=>{
  let streak=0;
  for(let i=0;i<=90;i++){
    const d=new Date(TODAY); d.setDate(TODAY.getDate()-i);
    const dStr=ds(d);
    const dayAll=tasks.filter(t=>isScheduledOnG(t,dStr));
    if(dayAll.length===0) continue; // no tasks scheduled — not a break, just skip
    if(dayAll.every(t=>doneOnDate(t,dStr))) streak++;
    else break;
  }
  return streak;
};
const getMostLikedTask=tasks=>{
  let best=null,bestCount=0;
  tasks.forEach(t=>{
    const c=(t.likes||[]).length;
    if(c>bestCount){ bestCount=c; best=t; }
  });
  return bestCount>0?{task:best,count:bestCount}:null;
};
const getOnTimeRate=tasks=>{
  const withDone=tasks.filter(t=>(t.doneOn||[]).length>0||t.rescheduledFrom);
  if(withDone.length===0) return null;
  const rescheduled=withDone.filter(t=>t.rescheduledFrom).length;
  return {onTimePct:Math.round((withDone.length-rescheduled)/withDone.length*100),total:withDone.length,rescheduled};
};

// ─── Constants ────────────────────────────────────────────────────────────────
const ZONES_DEFAULT = [
  {id:"kitchen",  label:"Kitchen",     emoji:"🍳"},
  {id:"bathroom", label:"Bathroom",    emoji:"🚿"},
  {id:"living",   label:"Living Room", emoji:"🛋️"},
  {id:"bedroom",  label:"Bedroom",     emoji:"🛏️"},
  {id:"hall",     label:"Hallway",     emoji:"🚪"},
  {id:"pets",     label:"Pets",        emoji:"🐾"},
];
const ZONE_EMOJIS = ["🍳","🚿","🛋️","🛏️","🚪","📦","🌿","🪟","🧹","🧺","🪣","🛁","🚽","🧴","🪴","🖥️","📚","🎮","🧸","🐾","🚗","🏋️","🎨","🎵","🏠","🏡","🚙","🍽️","☕","🧽","🧼","🗑️","🔌","💡","🪑","🚲","🧵","🎒","🧦","👕","🌱","🔧","🛠️","📮","🗄️","🖼️","🪞","🕯️","🧊","🌡️","📺","🎹","⚽"];
const AVATAR_EMOJIS = ["😀","😎","🥳","🦊","🐱","🐶","🐼","🦁","🐰","🐨","🐯","🐸","🌟","🎯","🍀","🔥","💎","🎸","🚀","🌈","⚡","🌸","🍕","🦄"];
const PALETTE = ["#f87171","#fb923c","#fbbf24","#34d399","#38bdf8","#7163F3","#e879f9","#94a3b8"];
// Public OAuth Client ID (safe to expose client-side) — replace with the real
// one from Google Cloud Console once created.
const GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";
const CONFETTI = ["#f87171","#fbbf24","#34d399","#7163F3","#e879f9","#38bdf8"];

const FREQ_OPTIONS = [
  {id:"once",    label:"Once",         days:null},
  {id:"daily",   label:"Every day",    days:1},
  {id:"every2",  label:"Every 2 days", days:2},
  {id:"every3",  label:"Every 3 days", days:3},
  {id:"weekly",  label:"Weekly",       days:7},
  {id:"monthly", label:"Monthly",      days:30},
  {id:"custom",  label:"Custom...",    days:null},
];
const FREQ_COLOR = {once:"#94a3b8",daily:"#34d399",every2:"#a3e635",every3:"#facc15",weekly:"#fb923c",monthly:"#f87171",custom:"#38bdf8"};

const STRINGS = {
  en: {
    tab_week:"Week", tab_calendar:"Calendar", tab_tasks:"Tasks", tab_settings:"Settings",
    header_hometasks:"Home Tasks", header_calendar:"Calendar", header_alltasks:"All Tasks", header_settings:"Settings",
    today:"Today", no_tasks_day:"No tasks for this day", all_done:"All done!", mine:"My Tasks",
    add_task:"Add Task", edit_task:"Edit Task", new_task:"New Task", save:"Save", save_changes:"Save Changes",
    cancel:"Cancel", delete:"Delete", assigned_to:"Assigned to", all:"All", zone:"Zone",
    frequency:"Frequency", start_date:"Start date", what_to_do:"What to do",
    zones:"Zones", people:"People", invite_code:"Invite code",
    share_code:"Share this code so your partner can join this home",
    sign_out:"Sign out", delete_account:"Delete account", signed_in_as:"Signed in as",
    stats:"Stats", this_week:"This week", all_time:"All time", streaks:"Streaks",
    zone_achievements:"Zone achievements", no_tasks_yet:"No tasks yet — tap + Add to create one",
    no_zones_yet:"No zones yet — add one to get started", language:"Language", theme:"Theme",
    dark:"Dark", light:"Light",
  },
  ru: {
    tab_week:"Неделя", tab_calendar:"Календарь", tab_tasks:"Задачи", tab_settings:"Настройки",
    header_hometasks:"Мои задачи", header_calendar:"Календарь", header_alltasks:"Все задачи", header_settings:"Настройки",
    today:"Сегодня", no_tasks_day:"На этот день задач нет", all_done:"Всё готово!", mine:"Мои",
    add_task:"Добавить задачу", edit_task:"Изменить задачу", new_task:"Новая задача", save:"Сохранить", save_changes:"Сохранить изменения",
    cancel:"Отмена", delete:"Удалить", assigned_to:"Исполнитель", all:"Все", zone:"Зона",
    frequency:"Частота", start_date:"Дата начала", what_to_do:"Что нужно сделать",
    zones:"Зоны", people:"Люди", invite_code:"Код приглашения",
    share_code:"Поделись этим кодом, чтобы партнёр смог присоединиться к этому дому",
    sign_out:"Выйти", delete_account:"Удалить аккаунт", signed_in_as:"Вход выполнен как",
    stats:"Статистика", this_week:"На этой неделе", all_time:"За всё время", streaks:"Стрики",
    zone_achievements:"Достижения по зонам", no_tasks_yet:"Задач пока нет — нажми + Добавить",
    no_zones_yet:"Зон пока нет — добавь первую", language:"Язык", theme:"Тема",
    dark:"Тёмная", light:"Светлая",
  },
};

const THEME_COLORS = {
  dark: {
    bg:"linear-gradient(160deg,#1a1035,#0d1f3c,#0a2a1f)",
    cardBg:"rgba(255,255,255,0.08)",
    textPrimary:"rgba(255,255,255,0.9)",
    textSecondary:"rgba(255,255,255,0.55)",
    textTertiary:"rgba(255,255,255,0.32)",
    border:"rgba(255,255,255,0.1)",
    inputBg:"rgba(255,255,255,0.9)",
    inputText:"#111",
  },
  light: {
    bg:"linear-gradient(160deg,#F0EDFF,#E9EEFF,#EAFFF5)",
    cardBg:"rgba(0,0,0,0.05)",
    textPrimary:"rgba(20,20,30,0.9)",
    textSecondary:"rgba(20,20,30,0.6)",
    textTertiary:"rgba(20,20,30,0.4)",
    border:"rgba(0,0,0,0.1)",
    inputBg:"rgba(255,255,255,1)",
    inputText:"#111",
  },
};
// Color scaled by actual day-interval (more frequent = green, rarer = red), so a
// custom interval lines up logically with the fixed presets instead of using an
// arbitrary fixed color regardless of how many days it actually spans.
function freqColorFor(t){
  if(t.freq==="once") return FREQ_COLOR.once;
  const days=t.freq==="custom"?t.customDays:FREQ_OPTIONS.find(f=>f.id===t.freq)?.days;
  if(days==null) return FREQ_COLOR.once;
  if(days<=1) return "#34d399";
  if(days<=3) return "#a3e635";
  if(days<=6) return "#facc15";
  if(days<=13) return "#fb923c";
  if(days<=29) return "#f97316";
  return "#f87171";
}
function freqLabelFor(t){
  if(t.freq==="custom") return `Every ${t.customDays} day${t.customDays!==1?"s":""}`;
  return FREQ_OPTIONS.find(f=>f.id===t.freq)?.label||t.freq;
}

const FREQ_PTS={once:3,daily:1,every2:2,every3:2,weekly:5,monthly:20,custom:3};

const STREAK_MILESTONES=[
  {days:3,  icon:"🔥",label:"On Fire",     desc:"3-day streak"},
  {days:7,  icon:"⚡",label:"Week Warrior", desc:"7-day streak"},
  {days:14, icon:"💫",label:"Two Weeks",    desc:"14-day streak"},
  {days:30, icon:"🌙",label:"Month Master", desc:"30-day streak"},
  {days:100,icon:"👑",label:"Century",      desc:"100-day streak"},
];

const getStreakMilestones=streak=>STREAK_MILESTONES.filter(m=>streak>=m.days);

const getWeeklyMVP=(tasks,people,dates)=>{
  if(people.length<2) return null;
  const scores=people.map(p=>({p,pts:tasks.reduce((s,t)=>s+dates.filter(d=>doneOnDateBy(t.doneOn,d,p.id)).length*(FREQ_PTS[t.freq]||1),0)}));
  scores.sort((a,b)=>b.pts-a.pts);
  return scores[0].pts>0&&scores[0].pts>scores[1].pts?scores[0].p:null;
};

const getDreamTeam=(tasks,people,dates)=>
  people.length>=2&&people.every(p=>tasks.some(t=>dates.some(d=>doneOnDateBy(t.doneOn,d,p.id))));

const getZoneAchLevel=(tasks,pid,zone)=>{
  const cnt=tasks.filter(t=>t.zone===zone).reduce((s,t)=>s+(t.doneOn||[]).filter(e=>e.by===pid).length,0);
  if(cnt>=100) return {level:"Gold",  icon:"🥇",color:"#fbbf24",next:null,cnt};
  if(cnt>=50)  return {level:"Silver",icon:"🥈",color:"#94a3b8",next:100, cnt};
  if(cnt>=10)  return {level:"Bronze",icon:"🥉",color:"#fb923c",next:50,  cnt};
  return null;
};

const MOTIV = [
  {icon:"🏆", text:"crushed it! Keep going!"},
  {icon:"💪", text:"is on fire today!"},
  {icon:"⭐", text:"earned a star — amazing!"},
  {icon:"🎯", text:"nailed it! You're the best!"},
  {icon:"🚀", text:"is going to the moon!"},
];

const TODAY = new Date(); TODAY.setHours(0,0,0,0);
const todayStr = TODAY.toISOString().slice(0,10);
const ds = d => (d instanceof Date ? d : new Date(d+"T00:00:00")).toISOString().slice(0,10);
// doneOn entries are now {date, by} objects (not plain date strings) so we can
// credit points/streaks to whoever ACTUALLY completed a task, not just whoever
// it happened to be assigned to.
// Module-level equivalent of the component's isScheduledOn — needed because
// getWeekStats/getHouseholdStreak/computeStreak live outside the component
// and previously only checked the raw scheduledDates array (missing recurring
// extrapolation entirely), which threw off streak counts.
const isScheduledOnG=(t,d)=>{
  if((t.excludedDates||[]).includes(d)) return false;
  if(t.scheduledDates.includes(d)) return true;
  if(!t.freq||t.freq==="once") return false;
  const f=FREQ_OPTIONS.find(x=>x.id===t.freq);
  const days=t.freq==="custom"?t.customDays:f?.days;
  if(!days) return false;
  if(t.shiftAnchor&&d>=t.shiftAnchor){
    const diff2=Math.round((new Date(d)-new Date(t.shiftAnchor))/(1000*60*60*24));
    return diff2%days===0;
  }
  const first=t.scheduledDates[0];
  if(!first||d<first) return false;
  const diff=Math.round((new Date(d)-new Date(first))/(1000*60*60*24));
  return diff%days===0;
};
const doneOnDate=(t,d)=>{
  const entries=(t.doneOn||[]).filter(e=>e.date===d);
  if(entries.length===0) return false;
  // Use the target that was in effect when these entries were actually
  // recorded (stamped on each entry at completion time), not today's current
  // timesPerDay — so a later change to "times per day" doesn't retroactively
  // rewrite whether an old day counts as done, while a fresh tap right now
  // still has to satisfy today's real target (since it gets stamped with the
  // CURRENT value at the moment it's added).
  const recordedTarget=Math.max(...entries.map(e=>e.target||1));
  return entries.length>=recordedTarget;
};
const doneCountOn=(t,d)=>(t.doneOn||[]).filter(e=>e.date===d).length;
const formatEstMinutes=min=>{
  if(!min) return "";
  const h=Math.floor(min/60),m=min%60;
  if(h===0) return `${m}m`;
  if(m===0) return `${h}h`;
  return `${h}h ${m}m`;
};
const doneOnDateBy=(doneOn,d,pid)=>(doneOn||[]).some(e=>e.date===d&&e.by===pid);

const uid=()=>(typeof crypto!=="undefined"&&crypto.randomUUID)?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
const initials = n => (n||"?").split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
// Wraps an async operation and retries it once after a short delay if it fails
// with a transient network error (mobile Safari's "Load failed" / fetch failures),
// so a momentary signal blip doesn't surface as a scary error to the user.
const isNetworkError=err=>{
  const msg=String(err?.message||err||"");
  return /load failed|failed to fetch|network|networkerror/i.test(msg);
};
const withRetry=async(fn)=>{
  try{
    return await fn();
  }catch(err){
    if(!isNetworkError(err)) throw err;
    await new Promise(r=>setTimeout(r,900));
    return await fn();
  }
};

// ─── Sample data ──────────────────────────────────────────────────────────────
const _base=new Date(TODAY); _base.setDate(TODAY.getDate()-30);
const _60=Array.from({length:90},(_,i)=>{const d=new Date(_base);d.setDate(_base.getDate()+i);return ds(d);});
const _past=_60.filter(d=>d<todayStr);
const _d1=_past.filter((_,i)=>i%3!==2);
const _d2=_past.filter((_,i)=>i%4!==1);
const _d3=_past.filter((_,i)=>i%5!==0);

// Streak demo: consecutive days ending yesterday
const _mkStreak=(n)=>Array.from({length:n},(_,i)=>{const d=new Date(TODAY);d.setDate(TODAY.getDate()-n+i);return ds(d);});
// Anya: 7-day streak, Misha: 30-day streak
const _d1s=[..._d1,..._mkStreak(7)].filter((v,i,a)=>v<todayStr&&a.indexOf(v)===i);
const _d3s=[..._d3,..._mkStreak(30)].filter((v,i,a)=>v<todayStr&&a.indexOf(v)===i);

const INIT_PEOPLE = [
  {id:"p1", name:"Anya",  color:"#f87171", avatarEmoji:"😎"},
  {id:"p2", name:"Misha", color:"#38bdf8", avatarEmoji:"🦊"},
];
const INIT_TASKS = [
  {id:"t1",zone:"kitchen", text:"Wash the sink",    freq:"daily",  personId:"p1",personIds:["p1"],scheduledDates:_60,doneOn:_d1s,likes:[],rescheduledFrom:null},
  {id:"t2",zone:"kitchen", text:"Wipe the stove",   freq:"daily",  personId:"p2",personIds:["p2"],scheduledDates:_60,doneOn:_d2,likes:[],rescheduledFrom:null},
  {id:"t3",zone:"bathroom",text:"Clean the toilet", freq:"weekly", personId:"p1",personIds:["p1"],scheduledDates:_60.filter((_,i)=>i%7===0),doneOn:[],likes:[],rescheduledFrom:null},
  {id:"t4",zone:"bathroom",text:"Wipe the mirror",  freq:"every3", personId:"p2",personIds:["p2"],scheduledDates:_60.filter((_,i)=>i%3===0),doneOn:[],likes:[],rescheduledFrom:null},
  {id:"t5",zone:"living",  text:"Vacuum",           freq:"weekly", personId:"p1",personIds:["p1"],scheduledDates:_60.filter((_,i)=>i%7===2),doneOn:[],likes:[],rescheduledFrom:null},
  {id:"t6",zone:"bedroom", text:"Make the bed",     freq:"daily",  personId:"p2",personIds:["p2"],scheduledDates:_60,doneOn:_d3s,likes:[],rescheduledFrom:null},
  {id:"t7",zone:"pets",    text:"Brush teeth",                                        freq:"daily",  personId:"p1",personIds:["p1"],scheduledDates:_60,doneOn:_d2,likes:[],rescheduledFrom:null},
  {id:"t8",zone:"pets",    text:"Give medication",                                    freq:"daily",  personId:"p2",personIds:["p2"],scheduledDates:_60,doneOn:_d1s,likes:["p1"+todayStr],rescheduledFrom:null},
  {id:"t9",zone:"living",  text:"Wipe all surfaces",freq:"weekly", personId:"p1",personIds:["p1","p2"],scheduledDates:_60.filter((_,i)=>i%7===1),doneOn:[],likes:[],rescheduledFrom:null},
  {id:"t10",zone:"kitchen",text:"Take out trash",                                     freq:"every2", personId:"p2",personIds:["p2"],scheduledDates:_60.filter((_,i)=>i%2===0),doneOn:_d2,likes:["p1"+todayStr,"p2"+todayStr],rescheduledFrom:(()=>{const d=new Date(TODAY);d.setDate(TODAY.getDate()-1);return ds(d);})()},
  {id:"t11",zone:"living", text:"Deep clean sofa",                                     freq:"monthly",personId:"p1",personIds:["p1","p2"],scheduledDates:[todayStr],doneOn:[],likes:[],rescheduledFrom:null},
];

// Patch: ensure ALL of a person's scheduled tasks are done within their streak demo window,
// otherwise a day-level streak breaks the moment ANY other task of theirs is incomplete that day.
const _patchStreakWindow=(arr,personId,streakDates)=>arr.map(t=>{
  const pIds=t.personIds&&t.personIds.length?t.personIds:[t.personId].filter(Boolean);
  if(!pIds.includes(personId)) return t;
  const toAdd=t.scheduledDates.filter(d=>streakDates.includes(d));
  return {...t,doneOn:[...new Set([...t.doneOn,...toAdd])]};
});
const _streak7Dates=_mkStreak(7).filter(d=>d<todayStr);
const _streak30Dates=_mkStreak(30).filter(d=>d<todayStr);
let INIT_TASKS_PATCHED=_patchStreakWindow(INIT_TASKS,"p1",_streak7Dates);
INIT_TASKS_PATCHED=_patchStreakWindow(INIT_TASKS_PATCHED,"p2",_streak30Dates);

const computeStreak = task => {
  let streak=0;
  for(let i=1;i<=60;i++){
    const d=new Date(TODAY); d.setDate(TODAY.getDate()-i);
    const dStr=ds(d);
    const myT=isScheduledOnG(task,dStr);
    if(!myT) continue;
    if(doneOnDate(task,dStr)) streak++;
    else break;
  }
  return streak;
};

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({person,size=30}){
  if(!person) return null;
  return (
    <div style={{width:size,height:size,flexShrink:0,
      display:"flex",alignItems:"center",justifyContent:"center"}}>
      <span style={{fontSize:size*.85,fontWeight:700,color:person.avatarEmoji?undefined:person.color,lineHeight:1,transform:"translateY(-1px)",display:"inline-block"}}>
        {person.avatarEmoji||initials(person.name)}
      </span>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
function MainApp({household, me:initialMe, email, onSignOut}){
  // Household-wide "day reset hour" — if set (e.g. 5 for 5am), the whole
  // household's notion of "today" doesn't roll over at midnight but at this
  // hour instead, so late-night task completion still counts toward the
  // previous day. Shadows the module-level TODAY/todayStr constants so every
  // existing date computation throughout this file picks it up automatically.
  const [dayResetHour,setDayResetHour]=useState(household.day_reset_hour||0);
  useEffect(()=>{
    supabase.from("households").select("day_reset_hour").eq("id",household.id).single()
      .then(({data,error})=>{
        if(error){ console.error("fetch day_reset_hour",error); return; }
        if(data) setDayResetHour(data.day_reset_hour||0);
      });
  },[household.id]);
  const TODAY=(()=>{
    const now=new Date();
    if(dayResetHour>0&&now.getHours()<dayResetHour) now.setDate(now.getDate()-1);
    now.setHours(0,0,0,0);
    return now;
  })();
  const todayStr=TODAY.toISOString().slice(0,10);


  const [tasks,   setTasks]   = useState([]);
  const [people,  setPeople]  = useState([]);
  const [zones,   setZones]   = useState([]);
  const [dataLoading,setDataLoading]=useState(true);
  const [lang,setLang]=useState(()=>{ try{ return localStorage.getItem("hometasks_lang")||"en"; }catch{ return "en"; } });
  const setLangPersisted=l=>{ setLang(l); try{ localStorage.setItem("hometasks_lang",l); }catch{} };
  const [theme,setTheme]=useState(()=>{ try{ return localStorage.getItem("hometasks_theme")||"dark"; }catch{ return "dark"; } });
  const setThemePersisted=th=>{ setTheme(th); try{ localStorage.setItem("hometasks_theme",th); }catch{} };
  const tr=key=>STRINGS[lang]?.[key]||STRINGS.en[key]||key;
  const tc=THEME_COLORS[theme];
  const isDark=theme==="dark";
  const ACCENT=isDark?"#9488F8":"#7163F3";
  const ACCENT2=isDark?"#6B5EE0":"#5E51E0"; // slightly deeper shade of ACCENT, for gradients that previously used two purple tones
  const C=o=>isDark?`rgba(255,255,255,${o})`:`rgba(20,20,30,${o})`;
  const S=o=>`rgba(255,255,255,${o})`; // surface/background tint — always white, unlike C() which is theme-aware (also used for text)
  // Consolidated gray-text scale (was a scatter of one-off opacity values like
  // 0.2, 0.38, 0.45, 0.55, 0.6 — now just 4 consistent levels)
  const TEXT1=C(0.9);  // primary — headings, active state
  const TEXT2=C(0.6);  // secondary — day numbers, normal-weight body text
  const TEXT3=C(0.4);  // tertiary — labels, unselected buttons
  const TEXT4=C(0.2);  // faint — placeholders, disabled/empty states
  // Spacing scale (was a scatter of 24/20/18/16/14/12/10/8/6/5/4/3/2 one-offs)
  const SPACE_LG=24;  // between major sections (header → week strip)
  const SPACE_MD=18;  // between secondary sections (progress → filters → tasks)
  const SPACE=12;      // standalone/medium gaps
  const SPACE_SM=8;    // within a group (cards in a list, chips in a row)
  const G=(o=0.1,b=20)=>({
    background:isDark
      ?`rgba(255,255,255,${o*1.05})`
      :"rgba(255,255,255,0.5)",
    backdropFilter:`blur(${b}px) saturate(200%)`,
    WebkitBackdropFilter:`blur(${b}px) saturate(200%)`,
    border:isDark?`1px solid ${C(0.14)}`:"1px solid rgba(255,255,255,0.5)",
    boxShadow:isDark
      ?"inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.15)"
      :"inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -1px 0 rgba(0,0,0,0.04)",
  });
  const CARD=isDark
    ? {background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:12,padding:"12px"}
    : {background:"#ffffff",borderRadius:12,padding:"12px"};
  const [codeCopied,setCodeCopied]=useState(false);
  const [customTimeOpen,setCustomTimeOpen]=useState(false);
  const [googleConnected,setGoogleConnected]=useState(null); // null=unknown/loading, true/false once checked
  const [settingsView,setSettingsView]=useState("main");
  const [newPassword,setNewPassword]=useState("");
  const [settingPassword,setSettingPassword]=useState(false);
  const [passwordMsg,setPasswordMsg]=useState("");
  const settingsScrollRef=useRef(null);
  const settingsMainScrollPos=useRef(0);
  const [zoneExpandId,setZoneExpandId]=useState(null);
  const [tab,     setTab]     = useState("week");
  const [taskFormOpen,setTaskFormOpen]=useState(false);
  const [taskFormVisible,setTaskFormVisible]=useState(false);
  const closeTaskForm=()=>{
    setTaskFormVisible(false);
    setTimeout(()=>{
      setForm(blankForm);setCustomTimeOpen(false);setEditTaskId(null);setTaskFormOpen(false);
    },320);
  };
  useEffect(()=>{
    if(taskFormOpen){
      const raf=requestAnimationFrame(()=>requestAnimationFrame(()=>setTaskFormVisible(true)));
      return ()=>cancelAnimationFrame(raf);
    }
  },[taskFormOpen]);
  const [sheetDragY,setSheetDragY]=useState(0);
  const sheetDragRef=useRef(null);
  const [selDay,  setSelDay]  = useState(todayStr);
  const [meId,    setMeId]    = useState(initialMe.id);
  const meIdRef=useRef(meId);
  useEffect(()=>{ meIdRef.current=meId; },[meId]);

  useEffect(()=>{
    supabase.from("google_calendar_tokens").select("person_id").eq("person_id",meId).maybeSingle()
      .then(({data})=>setGoogleConnected(!!data))
      .catch(()=>setGoogleConnected(false));
  },[meId]);
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    if(params.get("google_calendar_connected")){
      setGoogleConnected(true);
      setToast({icon:"📅",from:"Google Calendar connected",text:"Your tasks will now sync automatically"});
      setTimeout(()=>setToast(null),3000);
      window.history.replaceState({},"",window.location.pathname);
    } else if(params.get("google_calendar_error")){
      window.alert("Google Calendar connection failed: "+params.get("google_calendar_error"));
      window.history.replaceState({},"",window.location.pathname);
    }
  },[]);
  const connectGoogleCalendar=()=>{
    const redirectUri="https://housequest.design/api/google-callback";
    const scope="https://www.googleapis.com/auth/calendar.events";
    const url=`https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${meId}`;
    window.location.href=url;
  };
  const disconnectGoogleCalendar=()=>{
    if(!window.confirm("Disconnect Google Calendar? Your tasks will stop syncing.")) return;
    supabase.from("google_calendar_tokens").delete().eq("person_id",meId).then(({error})=>{
      if(error){ console.error("disconnectGoogleCalendar",error); return; }
      setGoogleConnected(false);
    });
  };

  // ── Load data from Supabase + realtime sync ──────────────────────────────
  const rowToPerson=r=>({id:r.id,name:r.name,color:r.color,avatarEmoji:r.avatar_emoji||""});
  const rowToZone=r=>({id:r.id,label:r.label,emoji:r.emoji,sortOrder:r.sort_order??0});
  const rowToTask=r=>({
    id:r.id,zone:r.zone_id,text:r.text,freq:r.freq,customDays:r.custom_days,
    personIds:r.person_ids||[],personId:(r.person_ids||[])[0]||null,
    scheduledDates:r.scheduled_dates||[],doneOn:r.done_on||[],likes:r.likes||[],
    rescheduledFrom:r.rescheduled_from,createdBy:r.created_by,confirmedBy:r.confirmed_by||[],
    excludedDates:r.excluded_dates||[],timesPerDay:r.times_per_day||1,shiftAnchor:r.shift_anchor||null,estMinutes:r.est_minutes??null,archivedAt:r.archived_at||null,
  });
  const rowToNotif=r=>({id:r.id,actorPersonId:r.actor_person_id,icon:r.icon,from:r.title,text:r.body,readBy:r.read_by||[]});

  useEffect(()=>{
    let active=true;
    const loadOnce=async()=>{
      const [{data:p},{data:z},{data:t}]=await Promise.all([
        supabase.from("people").select("*").eq("household_id",household.id),
        supabase.from("zones").select("*").eq("household_id",household.id),
        supabase.from("tasks").select("*").eq("household_id",household.id),
      ]);
      return {p:p||[],z:z||[],t:t||[]};
    };
    (async()=>{
      let {p,z,t}=await loadOnce();
      // Zones are seeded via a separate call right after household creation, so there's
      // a real race window where this first load can catch the household before zones
      // have finished writing. Retry a few times specifically when zones are empty,
      // so nobody ever has to manually pull-to-refresh (not even available in PWA mode).
      let attempts=0;
      while(active&&z.length===0&&attempts<4){
        await new Promise(r=>setTimeout(r,800));
        if(!active) return;
        ({p,z,t}=await loadOnce());
        attempts++;
      }
      if(!active) return;
      setPeople(p.map(rowToPerson));
      setZones(z.map(rowToZone).sort((a,b)=>a.sortOrder-b.sortOrder));
      setTasks(t.map(rowToTask));

      const {data:n}=await supabase.from("notifications").select("*").eq("household_id",household.id).order("created_at",{ascending:false}).limit(30);
      if(active) setNotifs((n||[]).map(rowToNotif).filter(x=>x.actorPersonId!==meIdRef.current));

      setDataLoading(false);

      // Belt-and-suspenders: tasks can occasionally lag slightly behind on a fresh
      // connection (read-replica/replication lag). Re-check shortly after and merge
      // in anything that wasn't there on the very first read, so nothing looks missing
      // without the user ever having to manually refresh.
      await new Promise(r=>setTimeout(r,1500));
      if(!active) return;
      const {data:t2}=await supabase.from("tasks").select("*").eq("household_id",household.id);
      if(active&&t2){
        const mapped=t2.map(rowToTask);
        setTasks(prev=>{
          const byId=new Map(prev.map(x=>[x.id,x]));
          mapped.forEach(x=>byId.set(x.id,x));
          return [...byId.values()];
        });
      }
    })();

    const channel=supabase.channel(`household-${household.id}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"tasks",filter:`household_id=eq.${household.id}`},payload=>{
        if(payload.eventType==="DELETE"){
          setTasks(ts=>ts.filter(t=>t.id!==payload.old.id));
        } else {
          const row=rowToTask(payload.new);
          setTasks(ts=>{
            const exists=ts.some(t=>t.id===row.id);
            return exists?ts.map(t=>t.id===row.id?row:t):[row,...ts];
          });
        }
      })
      .on("postgres_changes",{event:"*",schema:"public",table:"people",filter:`household_id=eq.${household.id}`},payload=>{
        if(payload.eventType==="DELETE"){
          setPeople(ps=>ps.filter(p=>p.id!==payload.old.id));
        } else {
          const row=rowToPerson(payload.new);
          setPeople(ps=>{
            const exists=ps.some(p=>p.id===row.id);
            return exists?ps.map(p=>p.id===row.id?row:p):[...ps,row];
          });
        }
      })
      .on("postgres_changes",{event:"*",schema:"public",table:"zones",filter:`household_id=eq.${household.id}`},payload=>{
        if(payload.eventType==="DELETE"){
          setZones(zs=>zs.filter(z=>z.id!==payload.old.id));
        } else {
          const row=rowToZone(payload.new);
          setZones(zs=>{
            const exists=zs.some(z=>z.id===row.id);
            const next=exists?zs.map(z=>z.id===row.id?row:z):[...zs,row];
            return next.sort((a,b)=>a.sortOrder-b.sortOrder);
          });
        }
      })
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications",filter:`household_id=eq.${household.id}`},payload=>{
        const row=rowToNotif(payload.new);
        if(row.actorPersonId===meIdRef.current) return; // notifications about your own actions aren't meaningful to see yourself
        setNotifs(ns=>ns.some(x=>x.id===row.id)?ns:[row,...ns]);
        setToast(row);
        setTimeout(()=>setToast(null),3000);
      })
      .subscribe();

    return ()=>{ active=false; supabase.removeChannel(channel); };
  },[household.id]);

  // Persist a task's current fields to Supabase (fire-and-forget, local state already updated)
  const persistTask=(id,fields)=>{
    const dbFields={};
    if("zone" in fields) dbFields.zone_id=fields.zone;
    if("text" in fields) dbFields.text=fields.text;
    if("freq" in fields) dbFields.freq=fields.freq;
    if("customDays" in fields) dbFields.custom_days=fields.customDays;
    if("personIds" in fields) dbFields.person_ids=fields.personIds;
    if("scheduledDates" in fields) dbFields.scheduled_dates=fields.scheduledDates;
    if("doneOn" in fields) dbFields.done_on=fields.doneOn;
    if("likes" in fields) dbFields.likes=fields.likes;
    if("rescheduledFrom" in fields) dbFields.rescheduled_from=fields.rescheduledFrom;
    if("confirmedBy" in fields) dbFields.confirmed_by=fields.confirmedBy;
    if("excludedDates" in fields) dbFields.excluded_dates=fields.excludedDates;
    if("timesPerDay" in fields) dbFields.times_per_day=fields.timesPerDay;
    if("estMinutes" in fields) dbFields.est_minutes=fields.estMinutes;
    if("shiftAnchor" in fields) dbFields.shift_anchor=fields.shiftAnchor;
    dbFields.updated_at=new Date().toISOString();
    supabase.from("tasks").update(dbFields).eq("id",id).then(({error})=>{
      if(error){
        console.error("persistTask",error);
        window.alert("Couldn't save this change to the server: "+error.message+"\n\nIt may not survive a page reload — please let Daria know.");
      }
    });
  };
  const syncTaskToGoogleCalendar=async(task,existingEventId)=>{
    if(!googleConnected) return;
    try{
      const {data:{session}}=await supabase.auth.getSession();
      if(!session?.access_token) return;
      await fetch("/api/google-calendar-sync",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          access_token:session.access_token,
          task_id:task.id,
          title:task.text,
          date:task.scheduledDates?.[0],
          existing_event_id:existingEventId||null,
        }),
      });
    }catch(err){
      console.error("syncTaskToGoogleCalendar",err); // best-effort — don't block the task save on calendar sync failures
    }
  };
  const insertTask=async(row)=>{
    try{
      const {error}=await withRetry(()=>supabase.from("tasks").insert({
        id:row.id,household_id:household.id,zone_id:row.zone,text:row.text,freq:row.freq,
        custom_days:row.customDays,person_ids:row.personIds,scheduled_dates:row.scheduledDates,
        done_on:row.doneOn,likes:row.likes,rescheduled_from:row.rescheduledFrom,created_by:row.createdBy,confirmed_by:row.confirmedBy||[],excluded_dates:row.excludedDates||[],times_per_day:row.timesPerDay||1,shift_anchor:row.shiftAnchor||null,est_minutes:row.estMinutes??null,
      }));
      if(error) console.error("insertTask",error);
      return error?error.message:null;
    }catch(err){
      console.error("insertTask",err);
      return String(err?.message||err);
    }
  };
  const deleteTaskRemote=id=>{
    // Soft-delete: mark as archived rather than actually removing the row, so
    // past completions/points stay intact in Stats even after the task is
    // "deleted" from the active lists.
    supabase.from("tasks").update({archived_at:new Date().toISOString()}).eq("id",id).then(({error})=>{ if(error) console.error("deleteTask",error); });
  };
  const persistPerson=(id,fields)=>{
    const dbFields={};
    if("name" in fields) dbFields.name=fields.name;
    if("color" in fields) dbFields.color=fields.color;
    if("avatarEmoji" in fields) dbFields.avatar_emoji=fields.avatarEmoji;
    supabase.from("people").update(dbFields).eq("id",id).then(({error})=>{ if(error) console.error("persistPerson",error); });
  };
  const insertPerson=p=>{
    supabase.from("people").insert({id:p.id,household_id:household.id,name:p.name,color:p.color,avatar_emoji:p.avatarEmoji}).then(({error})=>{ if(error) console.error("insertPerson",error); });
  };
  const deletePersonRemote=async(id)=>{
    const {error,count}=await supabase.from("people").delete({count:"exact"}).eq("id",id);
    if(error) console.error("deletePerson",error);
    return !error&&count>0;
  };
  const persistZone=(id,fields)=>{
    const dbFields={};
    if("label" in fields) dbFields.label=fields.label;
    if("emoji" in fields) dbFields.emoji=fields.emoji;
    supabase.from("zones").update(dbFields).eq("id",id).then(({error})=>{ if(error) console.error("persistZone",error); });
  };
  const insertZone=z=>{
    const nextOrder=zones.length?Math.max(...zones.map(x=>x.sortOrder||0))+1:1;
    supabase.from("zones").insert({id:z.id,household_id:household.id,label:z.label,emoji:z.emoji,sort_order:nextOrder}).then(({error})=>{ if(error) console.error("insertZone",error); });
  };
  const deleteZoneRemote=id=>{
    supabase.from("zones").delete().eq("id",id).then(({error})=>{ if(error) console.error("deleteZone",error); });
  };
  const reorderZones=(fromId,toId)=>{
    if(fromId===toId) return;
    setZones(zs=>{
      const arr=[...zs];
      const fromIdx=arr.findIndex(z=>z.id===fromId);
      const toIdx=arr.findIndex(z=>z.id===toId);
      if(fromIdx===-1||toIdx===-1) return zs;
      const [moved]=arr.splice(fromIdx,1);
      arr.splice(toIdx,0,moved);
      const reindexed=arr.map((z,i)=>({...z,sortOrder:i+1}));
      Promise.all(reindexed.map(z=>supabase.from("zones").update({sort_order:z.sortOrder}).eq("id",z.id)))
        .then(results=>{ results.forEach(({error})=>{ if(error) console.error("reorderZones",error); }); });
      return reindexed;
    });
  };

  const [myFilter,setMyFilter]= useState(false);
  const [weekZoneFilter,setWeekZoneFilter]= useState(null);
  const [taskZoneFilter,setTaskZoneFilter]= useState(null);

  const [weekOff, setWeekOff] = useState(0);
  const [calYear, setCalYear] = useState(TODAY.getFullYear());
  const [calMonth,setCalMonth]= useState(TODAY.getMonth());
  const [calSlideDir,setCalSlideDir]=useState(0); // -1 = came from right (prev), 1 = came from left (next)
  const [calScrolled,setCalScrolled]=useState(false);
  const calGridRef=useRef(null);
  const [dragInfo,setDragInfo]= useState(null);
  const [dragActive,setDragActive]= useState(false);
  const activeDragHandlerRef=useRef(null);
  const longPressTimerRef=useRef(null);
  const touchStartPosRef=useRef(null);
  const [zoneDragId,setZoneDragId]=useState(null);
  const [zoneDragOverId,setZoneDragOverId]=useState(null);
  const [zoneDragActive,setZoneDragActive]=useState(false);
  const zoneLongPressTimerRef=useRef(null);
  const zoneTouchStartPosRef=useRef(null);
  const zoneRefs=useRef({});
  const [dragOver,setDragOver]= useState(null);
  const [expandId,setExpandId]= useState(null);
  useEffect(()=>{ if(tab!=="tasks") setExpandId(null); },[tab]);
  useEffect(()=>{ if(tab!=="settings") setZoneExpandId(null); },[tab]);
  const [editTaskId,setEditTaskId]= useState(null);
  const [freeze,setFreeze]= useState(null); // {day, order:[ids]} — frozen render order during the 400ms hold
  const [justLiked,setJustLiked]= useState(null);
  const [activityOrder,setActivityOrder]= useState([]); // array of "id|date" keys, most recent action first (either direction)
  const [showStats,setShowStats]= useState(false);
  const [notifsVisible,setNotifsVisible]=useState(false);
  const [keyboardInset,setKeyboardInset]=useState(0);
  useEffect(()=>{
    if(!window.visualViewport) return;
    const onResize=()=>{
      const inset=Math.max(0,window.innerHeight-window.visualViewport.height-window.visualViewport.offsetTop);
      setKeyboardInset(inset);
    };
    window.visualViewport.addEventListener("resize",onResize);
    window.visualViewport.addEventListener("scroll",onResize);
    return ()=>{
      window.visualViewport.removeEventListener("resize",onResize);
      window.visualViewport.removeEventListener("scroll",onResize);
    };
  },[]);
  const [statsVisible,setStatsVisible]=useState(false);
  useEffect(()=>{
    if(showStats){
      setStatsVisible(false);
      const raf=requestAnimationFrame(()=>requestAnimationFrame(()=>setStatsVisible(true)));
      return ()=>cancelAnimationFrame(raf);
    } else {
      setStatsVisible(false);
    }
  },[showStats]);
  const closeStats=()=>{
    setStatsVisible(false);
    setTimeout(()=>setShowStats(false),320);
  };
  const [celebration,setCelebration]= useState(null);
  const [showNotifs,setShowNotifs]= useState(false);
  useEffect(()=>{
    if(showNotifs){
      setNotifsVisible(false);
      const raf=requestAnimationFrame(()=>requestAnimationFrame(()=>setNotifsVisible(true)));
      return ()=>cancelAnimationFrame(raf);
    } else {
      setNotifsVisible(false);
    }
  },[showNotifs]);
  const closeNotifs=()=>{
    setNotifsVisible(false);
    setTimeout(()=>setShowNotifs(false),320);
  };
  const [notifs,setNotifs]= useState([]);
  const markNotifsRead=ids=>{
    const toMark=ids.filter(id=>{
      const n=notifs.find(x=>x.id===id);
      return n&&!n.readBy.includes(meId);
    });
    if(toMark.length===0) return;
    setNotifs(ns=>ns.map(n=>toMark.includes(n.id)?{...n,readBy:[...n.readBy,meId]}:n));
    toMark.forEach(id=>{
      const n=notifs.find(x=>x.id===id);
      const newReadBy=[...n.readBy,meId];
      supabase.from("notifications").update({read_by:newReadBy}).eq("id",id).then(({error})=>{ if(error) console.error("markNotifRead",error); });
    });
  };
  const [toast,setToast]= useState(null);
  const [personModal,setPersonModal]= useState(null);
  const [pForm,setPForm]= useState({name:"",color:PALETTE[0],avatarEmoji:""});
  const [avatarPicker,setAvatarPicker]= useState(false);
  const [zoneModal,setZoneModal]= useState(null);
  const [zForm,setZForm]= useState({label:"",emoji:"🏠"});
  const [emojiPicker,setEmojiPicker]= useState(false);
  const [taskNameError,setTaskNameError]= useState(false);
  const [personNameError,setPersonNameError]= useState(false);
  const [zoneNameError,setZoneNameError]= useState(false);
  const [assigneeError,setAssigneeError]= useState(false);

  const blankForm = {zone:zones[0]?.id||"",text:"",freq:"daily",personIds:people.map(p=>p.id),customDays:4,startDate:todayStr,maxLen:32,timesPerDay:1,estMinutes:null};
  const [form,setForm]= useState(blankForm);

  const prevPct = useRef(0);
  const stripRef = useRef(null);
  const taskListRef = useRef(null);
  const [pressedTab,setPressedTab]=useState(null);
  const [pressedPlus,setPressedPlus]=useState(false);
  const [pressedBell,setPressedBell]=useState(false);
  const [pressedMyTasks,setPressedMyTasks]=useState(false);
  const [pressedDay,setPressedDay]=useState(null);
  const [pressedFilter,setPressedFilter]=useState(null);
  const [pressedCalArrow,setPressedCalArrow]=useState(null);
  const [pressedAddZone,setPressedAddZone]=useState(false);
  const [pressedStats,setPressedStats]=useState(false);
  const [pressedStatsBack,setPressedStatsBack]=useState(false);
  const [pressedZoneBack,setPressedZoneBack]=useState(false);
  const [pressedZoneAdd,setPressedZoneAdd]=useState(false);
  const [zoneScreenVisible,setZoneScreenVisible]=useState(false);
  const zoneNameInputRef=useRef(null);
  useEffect(()=>{
    if(zoneExpandId){
      setZoneScreenVisible(false);
      const raf=requestAnimationFrame(()=>requestAnimationFrame(()=>setZoneScreenVisible(true)));
      const focusTimer=setTimeout(()=>{ zoneNameInputRef.current?.focus(); },350);
      return ()=>{cancelAnimationFrame(raf);clearTimeout(focusTimer);};
    } else {
      setZoneScreenVisible(false);
    }
  },[zoneExpandId]);
  const pressStartRef=useRef({});
  const touchPosRef=useRef({});
  const MIN_PRESS_MS=140;
  const SCROLL_THRESHOLD=10;
  const pressStart=(key,setter,value,e)=>{
    const gen=(pressStartRef.current[key]?.gen||0)+1;
    pressStartRef.current[key]={time:Date.now(),gen};
    if(e&&e.touches&&e.touches[0]) touchPosRef.current[key]={x:e.touches[0].clientX,y:e.touches[0].clientY};
    setter(value);
  };
  const wasScrolled=(key,e)=>{
    const start=touchPosRef.current[key];
    if(!start||!e||!e.changedTouches||!e.changedTouches[0]) return false;
    const dx=Math.abs(e.changedTouches[0].clientX-start.x);
    const dy=Math.abs(e.changedTouches[0].clientY-start.y);
    return dx>SCROLL_THRESHOLD||dy>SCROLL_THRESHOLD;
  };
  const pressEnd=(key,setter,offValue)=>{
    const entry=pressStartRef.current[key]||{time:0,gen:0};
    const myGen=entry.gen;
    const elapsed=Date.now()-entry.time;
    const release=()=>{ if(pressStartRef.current[key]?.gen===myGen) setter(offValue); };
    if(elapsed>=MIN_PRESS_MS){ release(); }
    else { setTimeout(release,MIN_PRESS_MS-elapsed); }
  };
  const tabBarMeasureRef=useRef(null);
  const [tabBarWidth,setTabBarWidth]=useState(0);
  useLayoutEffect(()=>{
    const measure=()=>{ if(tabBarMeasureRef.current) setTabBarWidth(Math.round(tabBarMeasureRef.current.getBoundingClientRect().width)); };
    measure();
    window.addEventListener("resize",measure);
    return ()=>window.removeEventListener("resize",measure);
  },[tab,dataLoading]);
  const cardRefs = useRef({});
  const lastToggleRef = useRef({});
  const prevRects = useRef({});
  const taskNameRef = useRef(null);

  useEffect(()=>{
    if(!zoneDragActive||!zoneDragId) return;
    const el=zoneRefs.current[zoneDragId];
    if(!el) return;
    const handler=e=>{
      e.preventDefault();
      const touch=e.touches[0];
      const target=document.elementFromPoint(touch.clientX,touch.clientY);
      const zId=target?.closest("[data-zone-id]")?.dataset?.zoneId;
      if(zId) setZoneDragOverId(zId);
    };
    el.addEventListener("touchmove",handler,{passive:false});
    return ()=>el.removeEventListener("touchmove",handler);
  },[zoneDragActive,zoneDragId]);

  const assigneeRef = useRef(null);

  // Celebration is now triggered directly inside toggleDone (only on the actual completing action)

  useEffect(()=>{
    if(taskListRef.current) taskListRef.current.scrollTop=0;
  },[selDay]);

  // ── Scroll selected day to center (only when entering the Week tab) ────────
  const hasCenteredOnceRef=useRef(false);
  const weekScrollLeftRef=useRef(null);
  const prevTabRef=useRef(null);

  // One-time initial centering: only when the app first finishes loading,
  // center the strip on today (well, on whatever selDay starts as). After
  // this happens once, we never auto-center again — the user's own scroll
  // position takes over from here.
  useEffect(()=>{
    if(hasCenteredOnceRef.current) return;
    if(dataLoading) return;
    if(tab!=="week") return;
    if(!stripRef.current) return;
    hasCenteredOnceRef.current=true;
    let cancelled=false;
    const doCenter=()=>{
      if(cancelled) return;
      const el=stripRef.current;
      if(!el) return;
      const cell=el.querySelector(`[data-date="${selDay}"]`);
      if(!cell) return;
      cell.scrollIntoView({inline:"center",block:"nearest"});
      weekScrollLeftRef.current=el.scrollLeft;
    };
    requestAnimationFrame(doCenter);
    const timers=[100,300,600].map(ms=>setTimeout(doCenter,ms));
    return ()=>{ cancelled=true; timers.forEach(clearTimeout); };
  },[dataLoading,tab]);

  // Whenever we return to the Week tab (after the very first time), restore
  // whatever scroll position the user last left it at — never re-center.
  useEffect(()=>{
    const enteringWeek=tab==="week"&&prevTabRef.current!=="week";
    prevTabRef.current=tab;
    if(!enteringWeek) return;
    if(!hasCenteredOnceRef.current) return; // the initial-centering effect handles the very first entry
    if(weekScrollLeftRef.current==null) return;
    const el=stripRef.current;
    if(!el) return;
    el.scrollLeft=weekScrollLeftRef.current;
  },[tab]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const isDone=(t,d)=>doneOnDate(t,d);
  const isScheduledOn=(t,d)=>{
    if((t.excludedDates||[]).includes(d)) return false; // explicitly rescheduled away — never re-derive it via extrapolation
    if(t.scheduledDates.includes(d)) return true;
    // For repeating tasks, extrapolate beyond stored dates
    if(!t.freq||t.freq==="once") return false;
    const f=FREQ_OPTIONS.find(x=>x.id===t.freq);
    const days=t.freq==="custom"?t.customDays:f?.days;
    if(!days) return false;
    // If one occurrence was dragged to a later day, every occurrence from that
    // point forward shifts by the same amount — only the anchor point changes,
    // history before it keeps using the original schedule untouched.
    if(t.shiftAnchor&&d>=t.shiftAnchor){
      const diff2=Math.round((new Date(d)-new Date(t.shiftAnchor))/(1000*60*60*24));
      return diff2%days===0;
    }
    const first=t.scheduledDates[0];
    if(!first||d<first) return false;
    const diff=Math.round((new Date(d)-new Date(first))/(1000*60*60*24));
    return diff%days===0;
  };
  const dayTasks=d=>tasks.filter(t=>(!t.archivedAt||d<todayStr)&&isScheduledOn(t,d));
  const getPerson=id=>people.find(p=>p.id===id);
  const getZone=id=>zones.find(z=>z.id===id);
  const unread=notifs.filter(n=>!n.readBy.includes(meId)).length;
  const me=getPerson(meId);

  const toggleDone=(id,d)=>{
    const key0=id+"|"+d;
    const now=Date.now();
    if(lastToggleRef.current[key0]&&now-lastToggleRef.current[key0]<450) return; // ignore accidental rapid double-tap
    lastToggleRef.current[key0]=now;
    const t=tasks.find(x=>x.id===id);
    const wasFullyDone=t&&isDone(t,d);
    const currentCount=t?doneCountOn(t,d):0;
    const target=t?.timesPerDay||1;
    // For multi-times-per-day tasks, only the tap that actually reaches the
    // target should behave like "becoming done" (reorder animation, day
    // celebration) — intermediate taps (e.g. 2 of 4) shouldn't move the card
    // or celebrate anything yet.
    const becomingDone=!wasFullyDone&&(currentCount+1>=target);
    const key=id+"|"+d;
    if(becomingDone){
      const isLastUndone=d===selDay&&undoneRaw.length>0&&undoneRaw[undoneRaw.length-1].id===id;
      if(!isLastUndone&&d===selDay){
        setFreeze({day:d,order:selTasks.map(x=>x.id)});
        setTimeout(()=>setFreeze(null),400);
      }
      // Celebration: whole-household day complete takes priority; otherwise, celebrate
      // when THIS person finishes all of their OWN tasks for the day, even if others
      // in the household still have things left to do.
      const dayAll=tasks.filter(x=>isScheduledOn(x,d));
      const nowAllDone=dayAll.length>0&&dayAll.every(x=>x.id===id||doneOnDate(x,d));
      const myDayTasks=dayAll.filter(x=>(x.personIds||[x.personId]).includes(meId));
      const myNowAllDone=myDayTasks.length>0&&myDayTasks.every(x=>x.id===id||doneOnDate(x,d));
      if((nowAllDone||myNowAllDone)&&tab==="week"){
        const isToday=d===todayStr, isPast=d<todayStr;
        const dateLabel=isToday?"today":isPast?new Date(d+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}):"this day";
        const celebrationData=nowAllDone
          ?{title:"Day Complete! 🎉",subtitle:`All tasks done for ${dateLabel}!`,emoji:"🎉"}
          :{title:"Nice work! ✨",subtitle:`You're all done for ${dateLabel}!`,emoji:"✨"};
        setTimeout(()=>{
          setCelebration(celebrationData);
          setTimeout(()=>setCelebration(null),3500);
        },500);
      }
    } else if(wasFullyDone){
      const wasTopDone=d===selDay&&doneRawSorted.length>0&&doneRawSorted[0].id===id;
      if(!wasTopDone&&d===selDay){
        setFreeze({day:d,order:selTasks.map(x=>x.id)});
        setTimeout(()=>setFreeze(null),400);
      }
    }
    if(becomingDone||wasFullyDone) setActivityOrder(o=>[key,...o.filter(k=>k!==key)]);
    const newDoneOn=isDone(t,d)
      ? (t.doneOn||[]).filter(e=>e.date!==d) // fully done — tapping again resets the whole day back to zero
      : [...(t.doneOn||[]),{date:d,by:meId,target:t.timesPerDay||1}];
    setTasks(ts=>ts.map(t=>t.id!==id?t:{...t,doneOn:newDoneOn}));
    persistTask(id,{doneOn:newDoneOn});
  };

  const likeTask=(taskId,dateStr)=>{
    const t=tasks.find(x=>x.id===taskId); if(!t) return;
    const key=meId+dateStr;
    const wasLiked=(t.likes||[]).includes(key);
    const newLikes=wasLiked?(t.likes||[]).filter(l=>l!==key):[...(t.likes||[]),key];
    setTasks(ts=>ts.map(x=>{
      if(x.id!==taskId) return x;
      const has=(x.likes||[]).includes(key); // re-check against the freshest state, not a stale snapshot
      return {...x, likes: has ? (x.likes||[]).filter(l=>l!==key) : [...(x.likes||[]), key]};
    }));
    persistTask(taskId,{likes:newLikes});
    if(!wasLiked){
      setJustLiked(taskId+"|"+dateStr);
      setTimeout(()=>setJustLiked(null),400);
      const isOwn=(t.personIds||[t.personId]).includes(meId);
      if(!isOwn){
        const m=MOTIV[Math.floor(Math.random()*MOTIV.length)];
        const liker=getPerson(meId);
        const from=`${liker?.name||"Someone"} liked your task`;
        const bodyText=`${t.text} — ${m.text}`;
        supabase.from("notifications").insert({
          household_id:household.id,actor_person_id:meId,icon:m.icon,title:from,body:bodyText,
        }).then(({error})=>{ if(error) console.error("insert notification",error); });
      }
    }
  };

  const moveTask=(id,from,to)=>{
    if(from===to) return;
    let newFields=null;
    setTasks(ts=>ts.map(t=>{
      if(t.id!==id) return t;
      const dates=[...new Set([...t.scheduledDates.filter(x=>x!==from),to])].sort();
      const excludedDates=[...new Set([...(t.excludedDates||[]),from])];
      // for recurring tasks, shift every future occurrence forward too — not
      // just this one day
      const shiftAnchor=(t.freq&&t.freq!=="once")?to:t.shiftAnchor;
      newFields={scheduledDates:dates,doneOn:(t.doneOn||[]).filter(e=>e.date!==from),rescheduledFrom:from,excludedDates,shiftAnchor};
      return{...t,...newFields};
    }));
    if(newFields){
      persistTask(id,newFields);
      // TEMPORARY DIAGNOSTIC — same as moveIncompleteToNextDay's, so drag-based
      // moves are covered too regardless of which path is actually being used.
      const expectedFields=newFields;
      const taskRef=tasks.find(x=>x.id===id);
      setTimeout(()=>{
        supabase.from("tasks").select("scheduled_dates,excluded_dates").eq("id",id).single().then(({data,error})=>{
          if(error){ window.alert("DIAGNOSTIC (drag): couldn't re-read task: "+error.message); return; }
          const savedDates=JSON.stringify(data.scheduled_dates);
          const savedExcluded=JSON.stringify(data.excluded_dates);
          const expectedDates=JSON.stringify(expectedFields.scheduledDates);
          const expectedExcluded=JSON.stringify(expectedFields.excludedDates);
          if(savedDates!==expectedDates||savedExcluded!==expectedExcluded){
            window.alert(`DIAGNOSTIC (drag) — mismatch for "${taskRef?.text||id}":\n\nExpected scheduled_dates: ${expectedDates}\nActually in DB: ${savedDates}\n\nExpected excluded_dates: ${expectedExcluded}\nActually in DB: ${savedExcluded}`);
          } else {
            window.alert(`DIAGNOSTIC (drag) — "${taskRef?.text||id}" saved correctly:\nscheduled_dates: ${savedDates}\nexcluded_dates: ${savedExcluded}`);
          }
        });
      },1500);
    }
    setSelDay(to);
  };

  const moveIncompleteToNextDay=async(fromDay)=>{
    const nextDate=new Date(fromDay+"T00:00:00"); nextDate.setDate(nextDate.getDate()+1);
    const toDay=ds(nextDate);
    const incomplete=dayTasks(fromDay).filter(t=>!isDone(t,fromDay));
    const movedIds=[];
    const originals=[]; // snapshots for undo

    for(const t of incomplete){
      const original={id:t.id,scheduledDates:t.scheduledDates,excludedDates:t.excludedDates||[],shiftAnchor:t.shiftAnchor||null,doneOn:t.doneOn||[],rescheduledFrom:t.rescheduledFrom||null};

      const dates=[...new Set([...t.scheduledDates.filter(d=>d!==fromDay),toDay])].sort();
      const excludedDates=[...new Set([...(t.excludedDates||[]),fromDay])];
      const shiftAnchor=(t.freq&&t.freq!=="once")?toDay:(t.shiftAnchor||null);
      const doneOn=(t.doneOn||[]).filter(e=>e.date!==fromDay);

      let result;
      try{
        result=await supabase.from("tasks").update({
          scheduled_dates:dates,
          excluded_dates:excludedDates,
          shift_anchor:shiftAnchor,
          done_on:doneOn,
          rescheduled_from:fromDay,
        }).eq("id",t.id).select();
      }catch(err){
        window.alert(`Couldn't move "${t.text}" — a network error occurred:\n${err.message||err}`);
        continue;
      }

      if(result.error){
        window.alert(`Couldn't move "${t.text}" — the server rejected the change:\n${result.error.message}`);
        continue;
      }
      if(!result.data||result.data.length===0){
        window.alert(`Couldn't move "${t.text}" — the change didn't save. Please let Daria know.`);
        continue;
      }

      // Update local state to match what we just confirmed was saved
      setTasks(ts=>ts.map(x=>x.id!==t.id?x:{...x,scheduledDates:dates,excludedDates,shiftAnchor,doneOn,rescheduledFrom:fromDay}));
      movedIds.push(t.id);
      originals.push(original);
    }

    setSelDay(toDay);

    if(movedIds.length>0){
      const undoMove=async()=>{
        for(const o of originals){
          setTasks(ts=>ts.map(x=>x.id!==o.id?x:{...x,scheduledDates:o.scheduledDates,excludedDates:o.excludedDates,shiftAnchor:o.shiftAnchor,doneOn:o.doneOn,rescheduledFrom:o.rescheduledFrom}));
          supabase.from("tasks").update({
            scheduled_dates:o.scheduledDates,
            excluded_dates:o.excludedDates,
            shift_anchor:o.shiftAnchor,
            done_on:o.doneOn,
            rescheduled_from:o.rescheduledFrom,
          }).eq("id",o.id).then(({error})=>{ if(error) console.error("undoMove",error); });
        }
        setSelDay(fromDay);
      };
      setToast({icon:"➡️",from:`${movedIds.length} task${movedIds.length!==1?"s":""} moved`,text:`Moved to tomorrow`,onUndo:undoMove});
      setTimeout(()=>setToast(null),6000);
    }
  };

  const [savingTask,setSavingTask]= useState(false);
  const saveTask=async()=>{
    if(savingTask) return; // guard against double-tap creating the same task twice
    if(!form.text.trim()){
      setTaskNameError(true);
      taskNameRef.current?.scrollIntoView({behavior:"smooth",block:"center"});
      taskNameRef.current?.focus();
      return;
    }
    if(!form.zone||!zones.some(z=>z.id===form.zone)){
      window.alert("Please choose a zone for this task before saving.");
      return;
    }
    if(people.length>1&&(!form.personIds||form.personIds.length===0)){
      window.alert("Please choose at least one person for this task.");
      return;
    }
    setSavingTask(true);
    const f=FREQ_OPTIONS.find(x=>x.id===form.freq);
    let days=f?.days;
    if(form.freq==="custom") days=form.customDays;
    const startIdx=Math.max(0,_60.indexOf(form.startDate||todayStr));
    const base=_60.slice(startIdx);
    const dates=days?base.filter((_,i)=>i%days===0):[form.startDate||selDay];
    const wasEditing=!!editTaskId;
    if(editTaskId){
      const updated={...form,personId:form.personIds[0]||null,scheduledDates:dates};
      setTasks(ts=>ts.map(t=>t.id!==editTaskId?t:{...t,...updated}));
      persistTask(editTaskId,updated);
      const editedTask=tasks.find(t=>t.id===editTaskId);
      syncTaskToGoogleCalendar({...editedTask,...updated},editedTask?.googleEventId);
      setEditTaskId(null);
    } else {
      const newTask={id:uid(),...form,personId:form.personIds[0]||null,scheduledDates:dates,doneOn:[],likes:[],rescheduledFrom:null,createdBy:meId,confirmedBy:[meId]};
      setTasks(ts=>[newTask,...ts]);
      const errMsg=await insertTask(newTask);
      if(errMsg){
        window.alert("This task couldn't be saved to the server: "+errMsg+"\n\nIt will disappear when you reload — please try adding it again.");
        setTasks(ts=>ts.filter(t=>t.id!==newTask.id));
        setSavingTask(false);
        return;
      }
      syncTaskToGoogleCalendar(newTask);
      if(people.length>1){
        const creator=getPerson(meId);
        const assignedIds=(newTask.personIds||[]).filter(Boolean);
        const assignedNote=assignedIds.length===1&&assignedIds[0]!==meId
          ?` — assigned to ${getPerson(assignedIds[0])?.name||"you"}`
          :"";
        supabase.from("notifications").insert({
          household_id:household.id,actor_person_id:meId,icon:"🆕",
          title:`${creator?.name||"Someone"} added a new task${assignedNote}`,body:newTask.text,
        }).then(({error})=>{ if(error) console.error("insert new-task notification",error); });
      }
    }
    setForm(blankForm);
    setSavingTask(false);
    setToast({icon:wasEditing?"✏️":"✅",from:wasEditing?"Task updated":"Task added",text:form.text.trim()});
    setTimeout(()=>setToast(null),2800);
    if(tab==="week"&&dates[0]){
      setSelDay(dates[0]);
      weekScrollLeftRef.current=null;
      setTimeout(()=>{
        const el=stripRef.current;
        const cell=el?.querySelector(`[data-date="${dates[0]}"]`);
        cell?.scrollIntoView({inline:"center",block:"nearest"});
      },50);
    }
    setTaskFormVisible(false);
    setTimeout(()=>setTaskFormOpen(false),320);
  };

  const savePerson=()=>{
    if(!pForm.name.trim()){setPersonNameError(true);return;}
    if(personModal.mode==="new"){
      const newId=uid();
      const np={id:newId,name:pForm.name.trim(),color:pForm.color,avatarEmoji:pForm.avatarEmoji};
      setPeople(ps=>[...ps,np]);
      insertPerson(np);
    } else {
      const updated={name:pForm.name.trim(),color:pForm.color,avatarEmoji:pForm.avatarEmoji};
      setPeople(ps=>ps.map(p=>p.id===personModal.id?{...p,...updated}:p));
      persistPerson(personModal.id,updated);
    }
    setPersonModal(null); setAvatarPicker(false);
  };
  const deletePerson=id=>{
    const person=people.find(p=>p.id===id);
    if(!window.confirm(`Remove ${person?.name||"this person"}? Tasks assigned only to them will become unassigned.`)) return;
    setPeople(ps=>ps.filter(p=>p.id!==id));
    const affectedTasks=tasks.filter(t=>t.personId===id||(t.personIds||[]).includes(id));
    setTasks(ts=>ts.map(t=>({
      ...t,
      personId:t.personId===id?null:t.personId,
      personIds:(t.personIds||[]).filter(pid=>pid!==id),
    })));
    affectedTasks.forEach(t=>{
      const newPersonIds=(t.personIds||[]).filter(pid=>pid!==id);
      persistTask(t.id,{personIds:newPersonIds});
    });
    deletePersonRemote(id);
    if(meId===id) setMeId(people[0]?.id??"");
  };

  const saveZone=()=>{
    if(!zForm.label.trim()){setZoneNameError(true);return;}
    if(zoneModal?.mode==="new"){
      const nz={id:uid(),label:zForm.label.trim(),emoji:zForm.emoji};
      setZones(zs=>[...zs,nz]);
      insertZone(nz);
      setZoneModal(null);
    } else if(zoneExpandId){
      const updated={label:zForm.label.trim(),emoji:zForm.emoji};
      setZones(zs=>zs.map(z=>z.id===zoneExpandId?{...z,...updated}:z));
      persistZone(zoneExpandId,updated);
    }
    setEmojiPicker(false);
  };
  const deleteZone=id=>{
    const zone=zones.find(z=>z.id===id);
    const affectedTasks=tasks.filter(t=>t.zone===id&&!t.archivedAt);
    const msg=affectedTasks.length>0
      ?`Delete "${zone?.label}"? This will also permanently delete ${affectedTasks.length} task${affectedTasks.length!==1?"s":""} in this zone.`
      :`Delete "${zone?.label}"?`;
    if(!window.confirm(msg)) return;
    setZones(zs=>zs.filter(z=>z.id!==id));
    setTasks(ts=>ts.filter(t=>t.zone!==id));
    deleteZoneRemote(id);
    affectedTasks.forEach(t=>deleteTaskRemote(t.id));
  };

  // ── Computed ──────────────────────────────────────────────────────────────
  const visWeek=Array.from({length:21},(_,i)=>{const d=new Date(TODAY);d.setDate(TODAY.getDate()+weekOff-7+i);return d;});
  const selTasksRaw=dayTasks(selDay).filter(t=>myFilter?(t.personIds||[t.personId]).includes(meId):true).filter(t=>weekZoneFilter?t.zone===weekZoneFilter:true);
  const rankOf=t=>{const i=activityOrder.indexOf(t.id+"|"+selDay);return i===-1?Infinity:i;};
  const undoneRaw=selTasksRaw.filter(t=>!isDone(t,selDay)).sort((a,b)=>{
    const ra=rankOf(a),rb=rankOf(b);
    if(ra===Infinity&&rb===Infinity) return 0; // preserve original order among never-touched tasks
    return rb-ra; // oldest activity (or never-touched) first, most-recently-touched last (closest to done section)
  });
  const doneRawSorted=selTasksRaw.filter(t=>isDone(t,selDay)).sort((a,b)=>{
    const ra=rankOf(a),rb=rankOf(b);
    if(ra===Infinity&&rb===Infinity) return 0;
    return ra-rb; // most-recently-completed first (closest to undone section)
  });
  const selTasks=(freeze&&freeze.day===selDay)
    ? freeze.order.map(id=>selTasksRaw.find(t=>t.id===id)).filter(Boolean)
    : [...undoneRaw,...doneRawSorted];

  const prevSelDayRef=useRef(selDay);
  useLayoutEffect(()=>{
    if(prevSelDayRef.current!==selDay){
      prevRects.current={};
      prevSelDayRef.current=selDay;
    }
    const newRects={};
    selTasks.forEach(t=>{
      const el=cardRefs.current[t.id];
      if(el) newRects[t.id]=el.getBoundingClientRect().top;
    });
    Object.keys(newRects).forEach(id=>{
      const el=cardRefs.current[id];
      const oldTop=prevRects.current[id];
      const newTop=newRects[id];
      if(el&&oldTop!==undefined&&Math.abs(oldTop-newTop)>1){
        const delta=oldTop-newTop;
        el.style.transition="none";
        el.style.transform=`translateY(${delta}px)`;
        void el.offsetHeight; // force reflow so the browser paints the offset frame before we animate away from it
        requestAnimationFrame(()=>{
          requestAnimationFrame(()=>{
            el.style.transition="transform 0.35s cubic-bezier(0.4,0,0.2,1)";
            el.style.transform="";
          });
        });
      }
    });
    prevRects.current=newRects;
  },[selTasks.map(t=>t.id).join(",")]);
  const selDone=selTasks.filter(t=>isDone(t,selDay)).length;
  const dayAllTasks=dayTasks(selDay);
  const dayAllDone=dayAllTasks.filter(t=>isDone(t,selDay)).length;
  const pct=dayAllTasks.length===0?100:Math.round(dayAllDone/dayAllTasks.length*100);

  const groupedZones=(()=>{
    const activeTasks=tasks.filter(t=>!t.archivedAt);
    const grouped=zones.map(z=>({...z,tasks:activeTasks.filter(t=>t.zone===z.id).slice().reverse()})).filter(z=>z.tasks.length>0);
    const orphaned=activeTasks.filter(t=>!zones.some(z=>z.id===t.zone)).slice().reverse();
    if(orphaned.length>0) grouped.push({id:"__orphaned__",label:"Unfiled",emoji:"❓",tasks:orphaned});
    return grouped;
  })();

  const myStreak=(()=>{
    let streak=0;
    for(let i=1;i<=90;i++){
      const d=new Date(TODAY); d.setDate(TODAY.getDate()-i);
      const dStr=ds(d);
      const myT=tasks.filter(t=>(t.personIds||[t.personId]).includes(meId)&&isScheduledOn(t,dStr));
      if(myT.length===0){
        // no tasks this day — only skip if it's a gap in schedule, not a missed day
        continue;
      }
      if(myT.every(t=>doneOnDateBy(t.doneOn,dStr,meId))) streak++;
      else break;
    }
    return streak;
  })();

  const dayLabel=d=>{
    const dateStr=new Date(d+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"});
    if(d===todayStr) return `Today, ${dateStr}`;
    const yest=new Date(TODAY); yest.setDate(TODAY.getDate()-1);
    if(d===ds(yest)) return `Yesterday, ${dateStr}`;
    const tom=new Date(TODAY); tom.setDate(TODAY.getDate()+1);
    if(d===ds(tom)) return `Tomorrow, ${dateStr}`;
    return new Date(d+"T00:00:00").toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"});
  };

  const inputSt={background:"rgba(255,255,255,0.1)",borderRadius:14,padding:"0 14px",height:40,boxSizing:"border-box",color:C(0.9),fontSize:16,lineHeight:"18px",fontWeight:400,width:"100%",fontFamily:"inherit",outline:"none",border:`1px solid ${C(0.1)}`};
  const labelSt={color:C(0.6),fontSize:13,fontWeight:600,marginBottom:8,display:"block"};

  const TABS=[
    {id:"week",     icon:"week",     emoji:"📅",label:tr("tab_week")},
    {id:"calendar", icon:"calendar", emoji:"📆",label:tr("tab_calendar")},
    {id:"add",      emoji:"＋",label:"",accent:true},
    {id:"tasks",    icon:"tasks",    emoji:"📋",label:tr("tab_tasks")},
    {id:"settings", icon:"settings", emoji:"⚙️",label:tr("tab_settings")},
  ];

  if(dataLoading){
    return (
      <div style={{height:"100%",background:"#08080f",display:"flex",alignItems:"center",justifyContent:"center",color:C(0.4),fontFamily:"'SF Pro Text',-apple-system,system-ui,sans-serif"}}>
        Loading your home…
      </div>
    );
  }

  return (
    <div style={{height:"100%",background:"#08080f",display:"flex",justifyContent:"center",alignItems:"stretch",fontFamily:"'SF Pro Text',-apple-system,system-ui,sans-serif",overflow:"hidden"}}>
      <style>{`
        html,body,#root{height:100%;margin:0;background:#08080f;}
        html,body{position:fixed;inset:0;width:100%;}
        #root{width:100%;overflow:hidden;}
        body{overflow:hidden;overscroll-behavior:none;}
        .std-input:focus:not(.input-error){border-color:${ACCENT} !important;}
        .std-input::placeholder{color:${TEXT4} !important;opacity:1;}
        @keyframes slideDown{from{opacity:0;transform:translateX(-50%) translateY(-12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        @keyframes confettiFall{0%{transform:translateY(-10px) rotate(0deg);opacity:1}100%{transform:translateY(110px) rotate(720deg);opacity:0}}
        @keyframes celebUp{0%{transform:translateY(100%);opacity:0}20%{transform:translateY(-6px);opacity:1}30%{transform:translateY(0)}100%{transform:translateY(0);opacity:1}}
        @keyframes calSlideFromRight{from{transform:translateX(40px);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes calSlideFromLeft{from{transform:translateX(-40px);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes heartPop{0%{transform:scale(1)}40%{transform:scale(1.6)}70%{transform:scale(0.9)}100%{transform:scale(1)}}
        @keyframes checkPop{0%{transform:scale(0) rotate(-20deg);opacity:0}60%{transform:scale(1.3) rotate(5deg);opacity:1}100%{transform:scale(1) rotate(0);opacity:1}}
        @keyframes pulseBig{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
        @keyframes firework{0%{transform:scale(0);opacity:1}100%{transform:scale(2.5);opacity:0}}
        @keyframes fadeInUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        ::-webkit-scrollbar{display:none}
        *{-webkit-tap-highlight-color:transparent}
      `}</style>

      {/* Phone shell */}
      <div style={{width:"100%",maxWidth:480,overflow:"hidden",display:"flex",flexDirection:"column",height:"100%",position:"relative",background:tc.bg}}>

        {/* Glows */}
        {isDark&&<div style={{position:"absolute",top:-80,left:-60,width:280,height:280,borderRadius:"50%",background:`radial-gradient(circle,${ACCENT}44,transparent 70%)`,pointerEvents:"none",zIndex:0}}/>}
        {isDark&&<div style={{position:"absolute",top:120,right:-80,width:220,height:220,borderRadius:"50%",background:"radial-gradient(circle,#34d39922,transparent 70%)",pointerEvents:"none",zIndex:0}}/>}

        {/* Safe area spacer for notch/status bar */}
        <div style={{height:"env(safe-area-inset-top)",flexShrink:0}}/>

        {/* Toast */}
        {toast&&(
          <div onClick={()=>setToast(null)} style={{position:"absolute",bottom:110,left:"50%",transform:"translateX(-50%)",zIndex:999,...G(0.25,30),borderRadius:20,padding:"14px 16px",boxShadow:"0 8px 32px rgba(0,0,0,0.4)",display:"flex",alignItems:"center",gap:12,width:"calc(100% - 72px)",maxWidth:340,animation:"slideDown 0.3s ease",cursor:"pointer"}}>
            <span style={{fontSize:24,flexShrink:0}}>{toast.icon}</span>
            <div style={{minWidth:0,flex:1}}>
              <div style={{color:C(0.9),fontSize:14,fontWeight:700}}>{toast.from}</div>
              <div style={{color:C(0.6),fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{toast.text}</div>
            </div>
            {toast.onUndo&&<button onClick={e=>{e.stopPropagation();toast.onUndo();setToast(null);}} style={{flexShrink:0,background:"none",border:"none",color:ACCENT,fontSize:13,fontWeight:700,cursor:"pointer",padding:"6px 8px"}}>Undo</button>}
          </div>
        )}

        {/* Notifications panel */}
        {showNotifs&&(
          <div style={{position:"absolute",inset:0,zIndex:300,background:THEME_COLORS[theme].bg,display:"flex",flexDirection:"column",transform:`translateX(${notifsVisible?0:100}%)`,transition:"transform 0.32s cubic-bezier(0.32,0.72,0,1)"}}>
              <div style={{flexShrink:0,padding:"16px 16px 16px",display:"flex",alignItems:"center",gap:8}}>
                <button onClick={closeNotifs} style={{background:"none",border:"none",width:36,height:36,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,flexShrink:0}}>
                  <div style={{width:24,height:24,backgroundColor:TEXT2,WebkitMaskImage:"url(/icons/left.svg)",maskImage:"url(/icons/left.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center"}}/>
                </button>
                <div style={{color:C(0.9),fontFamily:"'SF Pro Display',-apple-system,sans-serif",fontSize:20,lineHeight:"24px",fontWeight:700}}>Notifications</div>
              </div>
              <div style={{flex:1,overflowY:"auto",padding:"0 16px 16px"}}>
                {notifs.length===0&&<div style={{textAlign:"center",padding:"60px 0"}}>
                  <div style={{fontSize:44}}>🔔</div>
                  <div style={{color:C(0.38),marginTop:10,fontSize:14}}>All caught up!</div>
                </div>}
                {notifs.map(n=>{const isUnread=!n.readBy.includes(meId); return (
                  <div key={n.id} style={{...CARD,display:"flex",gap:10,alignItems:"flex-start",marginBottom:8,background:isUnread?`${ACCENT}14`:CARD.background,cursor:"pointer"}} onClick={()=>{markNotifsRead([n.id]);closeNotifs();}}>
                    <span style={{fontSize:20,flexShrink:0,lineHeight:1,marginTop:1}}>{n.icon}</span>
                    <div style={{minWidth:0,flex:1}}>
                      <div style={{color:TEXT1,fontSize:13,fontWeight:600}}>{n.from}</div>
                      <div style={{color:TEXT3,fontSize:12,marginTop:2}}>{n.text}</div>
                    </div>
                    {isUnread&&<div style={{width:8,height:8,borderRadius:"50%",background:ACCENT,flexShrink:0,marginTop:4}}/>}
                  </div>
                );})}
              </div>
          </div>
        )}

        {/* Body */}
        <div style={{flex:1,overflow:"hidden",position:"relative",display:"flex",flexDirection:"column"}}>

          {/* ══ WEEK ══════════════════════════════════════════════ */}
          {tab==="week"&&(
            <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
              {/* Header */}
              <div style={{flexShrink:0,padding:"16px 16px 16px",display:"flex",alignItems:"flex-start",justifyContent:"space-between",fontFamily:"'SF Pro Text',-apple-system,sans-serif"}}>
                <div>
                  <div style={{color:C(0.88),fontFamily:"'SF Pro Display',-apple-system,sans-serif",fontSize:28,lineHeight:"34px",fontWeight:700}}>{tr("header_hometasks")}</div>
                  {myStreak>0&&<div style={{color:"#fbbf24",fontSize:14,marginTop:4,display:"flex",alignItems:"center",gap:6}}><div style={{width:14,height:14,backgroundColor:"#fbbf24",WebkitMaskImage:"url(/icons/streak-fill.svg)",maskImage:"url(/icons/streak-fill.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center"}}/>{myStreak}-day streak!</div>}
                  {myStreak===0&&<div style={{color:TEXT2,fontSize:14,marginTop:4}}>Start your streak today!</div>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  {people.length>1&&(
                  <button
                    onTouchStart={e=>{e.preventDefault();pressStart("mytasks",setPressedMyTasks,true);}} onTouchEnd={e=>{e.preventDefault();setMyFilter(f=>!f);pressEnd("mytasks",setPressedMyTasks,false);}} onTouchCancel={()=>pressEnd("mytasks",setPressedMyTasks,false)}
                    onMouseDown={()=>pressStart("mytasks",setPressedMyTasks,true)} onMouseUp={()=>{setMyFilter(f=>!f);pressEnd("mytasks",setPressedMyTasks,false);}} onMouseLeave={()=>pressEnd("mytasks",setPressedMyTasks,false)}
                    style={{position:"relative",display:"flex",alignItems:"center",gap:8,height:40,background:myFilter?"rgba(129,140,248,0.28)":S(0.05),border:"none",borderRadius:20,padding:"12px 16px 12px 12px",cursor:"pointer",transition:"background-color 0.2s ease"}}>
                    <div style={{position:"absolute",inset:0,borderRadius:20,border:`1px solid ${myFilter?ACCENT:S(0.1)}`,pointerEvents:"none",transition:"border-color 0.2s ease"}}/>
                    <div style={{display:"flex",alignItems:"center",gap:8,transform:pressedMyTasks?"scale(1.06)":"scale(1)",transition:pressedMyTasks?"transform 0.1s ease-out":"transform 0.4s cubic-bezier(0.34,1.56,0.64,1)"}}>
                      <Avatar person={me} size={18}/>
                      <span style={{color:myFilter?"#fff":TEXT2,fontSize:14,fontWeight:500}}>{tr("mine")}</span>
                    </div>
                  </button>
                  )}
                  {people.length>1&&(
                  <button
                    onTouchStart={e=>{e.preventDefault();pressStart("bell",setPressedBell,true);}} onTouchEnd={e=>{e.preventDefault();if(showNotifs){closeNotifs();}else{setShowNotifs(true);markNotifsRead(notifs.map(n=>n.id));}pressEnd("bell",setPressedBell,false);}} onTouchCancel={()=>pressEnd("bell",setPressedBell,false)}
                    onMouseDown={()=>pressStart("bell",setPressedBell,true)} onMouseUp={()=>{if(showNotifs){closeNotifs();}else{setShowNotifs(true);markNotifsRead(notifs.map(n=>n.id));}pressEnd("bell",setPressedBell,false);}} onMouseLeave={()=>pressEnd("bell",setPressedBell,false)}
                    style={{position:"relative",zIndex:55,background:"none",border:"none",width:24,height:24,padding:0,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",touchAction:"manipulation"}}>
                    <div style={{width:24,height:24,backgroundColor:ACCENT,WebkitMaskImage:`url(/icons/notifications-${showNotifs?"fill":"outline"}.svg)`,maskImage:`url(/icons/notifications-${showNotifs?"fill":"outline"}.svg)`,WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center",transform:pressedBell?"scale(1.22)":"scale(1)",transition:pressedBell?"transform 0.1s ease-out":"transform 0.4s cubic-bezier(0.34,1.56,0.64,1)"}}/>
                    {unread>0&&<div style={{position:"absolute",top:4,right:4,width:8,height:8,borderRadius:"50%",background:"#f87171",border:"2px solid #111116"}}/>}
                  </button>
                  )}
                </div>
              </div>

              {/* Week strip */}
              <div style={{flexShrink:0,margin:"0"}}>
                <div ref={stripRef} onScroll={e=>{weekScrollLeftRef.current=e.currentTarget.scrollLeft;}} style={{display:"flex",gap:5,paddingLeft:20,paddingRight:20,paddingTop:8,paddingBottom:20,overflowX:"auto",WebkitOverflowScrolling:"touch",msOverflowStyle:"none",scrollbarWidth:"none",
                  WebkitMaskImage:"linear-gradient(to right,transparent 0%,black 12%,black 88%,transparent 100%)",
                  maskImage:"linear-gradient(to right,transparent 0%,black 12%,black 88%,transparent 100%)"}}>
                  {visWeek.map(d=>{
                    const dStr=ds(d);
                    const isPast=dStr<todayStr,isToday=dStr===todayStr;
                    const cnt=dayTasks(dStr).length;
                    const doneCnt=dayTasks(dStr).filter(t=>isDone(t,dStr)).length;
                    const active=selDay===dStr,over=dragOver===dStr;
                    const pDay=cnt===0?0:Math.round(doneCnt/cnt*100);
                    const R=13,CIRC=2*Math.PI*R,DA=CIRC*(pDay/100);
                    return (
                      <div key={dStr}
                        onDragOver={e=>{e.preventDefault();setDragOver(dStr);}}
                        onDragLeave={()=>setDragOver(null)}
                        onDrop={()=>{if(dragInfo)moveTask(dragInfo.id,dragInfo.from,dStr);setDragInfo(null);setDragOver(null);}}
                        onTouchStart={e=>{e.preventDefault();pressStart("day"+dStr,setPressedDay,dStr);}}
                        onTouchEnd={e=>{e.preventDefault();setSelDay(dStr);pressEnd("day"+dStr,setPressedDay,null);}}
                        onTouchCancel={()=>pressEnd("day"+dStr,setPressedDay,null)}
                        onMouseDown={()=>pressStart("day"+dStr,setPressedDay,dStr)}
                        onMouseUp={()=>{setSelDay(dStr);pressEnd("day"+dStr,setPressedDay,null);}}
                        onMouseLeave={()=>pressEnd("day"+dStr,setPressedDay,null)}
                        data-date={dStr}
                        style={{
                          position:"relative",flex:"0 0 46px",width:46,height:78,borderRadius:12,
                          background:isDark?"rgba(255,255,255,0.05)":S(0.06),
                          boxShadow:"none",
                          cursor:"pointer",
                          touchAction:"manipulation",
                        }}>
                        {/* Selection indicator: fixed shape, just fades in/out via opacity — never snaps a border-width or swaps a background color directly */}
                        <div style={{position:"absolute",inset:0,borderRadius:12,background:"rgba(129,140,248,0.28)",border:`2px solid ${ACCENT}`,opacity:active?1:0,transition:"opacity 0.2s ease",pointerEvents:"none"}}/>
                        {isToday&&<div style={{position:"absolute",inset:0,borderRadius:12,border:`1px solid ${ACCENT}`,opacity:active?0:1,transition:"opacity 0.2s ease",pointerEvents:"none"}}/>}
                        {!isToday&&<div style={{position:"absolute",inset:0,borderRadius:12,border:`1px solid ${S(0.1)}`,opacity:active?0:1,transition:"opacity 0.2s ease",pointerEvents:"none"}}/>}
                        <div style={{position:"absolute",inset:0,padding:"8px 0",display:"flex",flexDirection:"column",alignItems:"center",gap:2,transform:pressedDay===dStr?"scale(1.1)":"scale(1)",transition:pressedDay===dStr?"transform 0.1s ease-out":"transform 0.4s cubic-bezier(0.34,1.56,0.64,1)"}}>
                        <span style={{fontSize:12,fontWeight:500,color:active?"#fff":isToday?"#a5b4fc":TEXT3}}>
                          {d.toLocaleDateString("en-US",{weekday:"short"})}
                        </span>
                        {(isPast||isToday)&&cnt>0?(
                          <div style={{position:"relative",width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center"}}>
                            <svg width="32" height="32" style={{position:"absolute",top:0,left:0,transform:"rotate(-90deg)"}}>
                              <circle cx="16" cy="16" r={R} fill="none" stroke={C(0.08)} strokeWidth="2.5"/>
                              <circle cx="16" cy="16" r={R} fill="none" stroke={active?"#fff":isToday?ACCENT:pDay===100?"#34d399":"#f87171"} strokeWidth="2.5" strokeDasharray={`${DA} ${CIRC}`} strokeLinecap="round" style={{transition:"stroke-dasharray 0.3s ease"}}/>
                            </svg>
                            <span style={{fontSize:14,fontWeight:700,position:"relative",zIndex:1,color:active?"#fff":isToday?"#fff":pDay===100?"#34d399":TEXT2}}>{d.getDate()}</span>
                          </div>
                        ):(
                          <div style={{width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:16,fontWeight:700,color:active?"#fff":isToday?"#fff":TEXT2}}>{d.getDate()}</span></div>
                        )}
                        {!isPast&&!isToday&&cnt>0&&<div style={{width:4,height:4,borderRadius:"50%",background:active?S(0.7):S(0.38)}}/>}
                        {(isPast||isToday||(!cnt&&!isToday))&&!((isPast||isToday)&&cnt>0)&&<div style={{height:4}}/>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Progress */}
              {dayAllTasks.length>0&&(
                <div style={{flexShrink:0,padding:`4px 16px ${SPACE_MD}px 16px`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:10}}>
                    <span style={{color:TEXT3,fontSize:12}}>{dayLabel(selDay)}</span>
                    <span style={{color:pct===100?"#34d399":TEXT3,fontSize:12,fontWeight:600}}>
                      {pct===100?(<span style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:12,height:12,backgroundColor:"#34d399",WebkitMaskImage:"url(/icons/check.svg)",maskImage:"url(/icons/check.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center"}}/>All done!</span>):`${dayAllDone} of ${dayAllTasks.length}`}
                    </span>
                  </div>
                  <div style={{background:S(0.07),borderRadius:4,height:3,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct}%`,borderRadius:4,transition:"width 0.4s",background:pct===100?"linear-gradient(90deg,#34d399,#6ee7b7)":`linear-gradient(90deg,${ACCENT},#a78bfa)`}}/>
                  </div>
                </div>
              )}

              {/* Move incomplete tasks forward — only for yesterday; older days are past the point of moving them */}
              {(()=>{const y=new Date(TODAY);y.setDate(y.getDate()-1);return selDay===ds(y);})()&&dayAllTasks.length>0&&dayAllDone<dayAllTasks.length&&(
                <div style={{flexShrink:0,margin:"0 20px 14px",...G(0.08,20),border:"1px solid rgba(251,191,36,0.25)",borderRadius:16,padding:"12px 14px",display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:18}}>⏭️</span>
                  <div style={{flex:1,color:C(0.7),fontSize:12,lineHeight:1.4}}>
                    {dayAllTasks.length-dayAllDone} unfinished task{dayAllTasks.length-dayAllDone!==1?"s":""} from this day — move to the next day?
                  </div>
                  <button onClick={()=>moveIncompleteToNextDay(selDay)} style={{flexShrink:0,background:"rgba(251,191,36,0.15)",border:"1px solid rgba(251,191,36,0.35)",borderRadius:12,padding:"8px 12px",color:"#fbbf24",fontSize:12,fontWeight:700,cursor:"pointer"}}>Move</button>
                </div>
              )}

              {/* Filter bar */}
              <div style={{flexShrink:0,padding:`0 16px ${SPACE_MD}px`}}>
                <div style={{display:"flex",gap:0,padding:2,background:isDark?"rgba(78,82,135,0.5)":"rgba(255,255,255,0.6)",border:isDark?"1px solid #494D68":"1px solid rgba(255,255,255,1)",borderRadius:22,overflowX:"auto",msOverflowStyle:"none",scrollbarWidth:"none"}}>
                <button
                  onTouchStart={e=>{pressStart("wf-all",setPressedFilter,"wf-all",e);}}
                  onTouchEnd={e=>{if(!wasScrolled("wf-all",e)){e.preventDefault();setWeekZoneFilter(null);}pressEnd("wf-all",setPressedFilter,null);}}
                  onTouchCancel={()=>pressEnd("wf-all",setPressedFilter,null)}
                  onMouseDown={()=>pressStart("wf-all",setPressedFilter,"wf-all")}
                  onMouseUp={()=>{setWeekZoneFilter(null);pressEnd("wf-all",setPressedFilter,null);}}
                  onMouseLeave={()=>pressEnd("wf-all",setPressedFilter,null)}
                  style={{position:"relative",flexShrink:0,height:36,border:"none",padding:"0 16px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",background:"transparent"}}>
                  <div style={{position:"absolute",inset:0,borderRadius:18,background:"rgba(129,140,248,0.28)",border:`1.5px solid ${ACCENT}`,opacity:weekZoneFilter===null?1:0,transition:"opacity 0.2s ease"}}/>
                  <span style={{position:"relative",fontSize:14,fontWeight:500,color:weekZoneFilter===null?"#fff":TEXT2,whiteSpace:"nowrap",display:"inline-block",transform:pressedFilter==="wf-all"?"scale(1.1)":"scale(1)",transition:pressedFilter==="wf-all"?"transform 0.1s ease-out":"transform 0.4s cubic-bezier(0.34,1.56,0.64,1)"}}>{tr("all")}</span>
                </button>
                {zones.filter(z=>dayTasks(selDay).some(t=>t.zone===z.id)).map(z=>(
                  <button key={z.id}
                    onTouchStart={e=>{pressStart("wf"+z.id,setPressedFilter,"wf"+z.id,e);}}
                    onTouchEnd={e=>{if(!wasScrolled("wf"+z.id,e)){e.preventDefault();setWeekZoneFilter(weekZoneFilter===z.id?null:z.id);}pressEnd("wf"+z.id,setPressedFilter,null);}}
                    onTouchCancel={()=>pressEnd("wf"+z.id,setPressedFilter,null)}
                    onMouseDown={()=>pressStart("wf"+z.id,setPressedFilter,"wf"+z.id)}
                    onMouseUp={()=>{setWeekZoneFilter(weekZoneFilter===z.id?null:z.id);pressEnd("wf"+z.id,setPressedFilter,null);}}
                    onMouseLeave={()=>pressEnd("wf"+z.id,setPressedFilter,null)}
                    style={{position:"relative",flexShrink:0,height:36,border:"none",padding:"0 16px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",background:"transparent"}}>
                    <div style={{position:"absolute",inset:0,borderRadius:18,background:"rgba(129,140,248,0.28)",border:`1.5px solid ${ACCENT}`,opacity:weekZoneFilter===z.id?1:0,transition:"opacity 0.2s ease"}}/>
                    <span style={{position:"relative",fontSize:14,fontWeight:500,color:weekZoneFilter===z.id?"#fff":TEXT2,whiteSpace:"nowrap",display:"inline-block",transform:pressedFilter==="wf"+z.id?"scale(1.1)":"scale(1)",transition:pressedFilter==="wf"+z.id?"transform 0.1s ease-out":"transform 0.4s cubic-bezier(0.34,1.56,0.64,1)"}}>{z.emoji} {z.label}</span>
                  </button>
                ))}
              </div>
              </div>

              {/* Task cards */}
              <div ref={taskListRef} style={{flex:1,overflowY:"auto",padding:"0 16px",display:"flex",flexDirection:"column",gap:SPACE_SM,paddingBottom:110}}>
                {selTasks.length===0?(
                  <div style={{textAlign:"center",padding:"40px 0"}}>
                    <div style={{fontSize:44}}>✨</div>
                    <div style={{color:C(0.38),marginTop:10,fontSize:14}}>No tasks for this day</div>
                  </div>
                ):selTasks.map(t=>{
                  const done=isDone(t,selDay),doneCount=doneCountOn(t,selDay),person=getPerson(t.personId),zone=getZone(t.zone);
                  const liked=(t.likes||[]).includes(meId+selDay);
                  const likeCount=(t.likes||[]).filter(l=>l.endsWith(selDay)).length;
                  const streak=computeStreak(t);
                  const isFuture=selDay>todayStr;
                  return (
                    <div key={t.id+"-"+selDay} ref={el=>{if(el)cardRefs.current[t.id]=el;}} draggable
                      onDragStart={()=>setDragInfo({id:t.id,from:selDay})}
                      onDragEnd={()=>{setDragInfo(null);setDragOver(null);}}
                      onTouchStart={e=>{
                        const touch=e.touches[0];
                        touchStartPosRef.current={x:touch.clientX,y:touch.clientY};
                        clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current=setTimeout(()=>{
                          setDragInfo({id:t.id,from:selDay});
                          setDragActive(true);
                          if(navigator.vibrate) navigator.vibrate(10);
                          // Attach the real, non-passive touchmove listener right now,
                          // synchronously — waiting for a React re-render (via a
                          // useEffect keyed on dragActive) can be just late enough
                          // for iOS Safari to have already committed to scrolling
                          // the page for this touch sequence.
                          const el=cardRefs.current[t.id];
                          if(el){
                            const handler=me=>{
                              me.preventDefault();
                              const mt=me.touches[0];
                              const target=document.elementFromPoint(mt.clientX,mt.clientY);
                              const d=target?.closest("[data-date]")?.dataset?.date;
                              if(d) setDragOver(d);
                            };
                            el.addEventListener("touchmove",handler,{passive:false});
                            activeDragHandlerRef.current={el,handler};
                          }
                        },380);
                      }}
                      onTouchMove={e=>{
                        if(dragActive) return; // real dragging is handled by the directly-attached native listener now
                        // not in drag mode yet — if the finger has moved noticeably,
                        // this is a normal scroll gesture, so cancel the pending long-press
                        const touch=e.touches[0];
                        const start=touchStartPosRef.current;
                        if(start){
                          const dx=Math.abs(touch.clientX-start.x), dy=Math.abs(touch.clientY-start.y);
                          if(dx>8||dy>8) clearTimeout(longPressTimerRef.current);
                        }
                      }}
                      onTouchEnd={e=>{
                        clearTimeout(longPressTimerRef.current);
                        if(activeDragHandlerRef.current){
                          activeDragHandlerRef.current.el.removeEventListener("touchmove",activeDragHandlerRef.current.handler);
                          activeDragHandlerRef.current=null;
                        }
                        if(!dragActive){ setDragInfo(null); return; }
                        const touch=e.changedTouches[0];
                        const el=document.elementFromPoint(touch.clientX,touch.clientY);
                        const toDate=el?.closest("[data-date]")?.dataset?.date;
                        if(toDate&&dragInfo) moveTask(dragInfo.id,dragInfo.from,toDate);
                        setDragInfo(null);setDragOver(null);setDragActive(false);
                      }}
                      style={{...CARD,padding:"12px",display:"flex",alignItems:"center",gap:12,transition:"opacity 0.2s, transform 0.15s, box-shadow 0.15s",cursor:"grab",touchAction:dragActive&&dragInfo?.id===t.id?"none":"pan-y",position:"relative",WebkitUserSelect:"none",userSelect:"none",WebkitTouchCallout:"none",
                        animation:"fadeInUp 0.2s ease",
                        transform:dragActive&&dragInfo?.id===t.id?"scale(1.03)":"scale(1)",
                        boxShadow:dragActive&&dragInfo?.id===t.id?"0 8px 24px rgba(0,0,0,0.4)":"none",
                        zIndex:dragActive&&dragInfo?.id===t.id?10:1,
}}>
                      {/* Check */}
                      {(t.timesPerDay||1)>1?(
                        <button onClick={e=>{ if(isFuture) return; e.currentTarget.blur(); toggleDone(t.id,selDay); }} style={{
                          width:24,height:24,borderRadius:"50%",flexShrink:0,padding:0,border:isFuture?`2px solid ${C(0.2)}`:"none",boxSizing:"border-box",
                          background:done?"linear-gradient(135deg,#34d399,#6ee7b7)":"none",cursor:isFuture?"not-allowed":"pointer",
                          position:"relative",transition:"all 0.2s",
                        }}>
                          {!done&&!isFuture&&(()=>{ const R=10.9,CIRC2=2*Math.PI*R,frac=Math.min(1,doneCount/(t.timesPerDay||1)),DA2=frac*CIRC2; return (
                          <svg viewBox="0 0 24 24" style={{position:"absolute",inset:0,width:"100%",height:"100%",transform:"rotate(-90deg)",overflow:"visible"}}>
                            <circle cx="12" cy="12" r={R} fill="none" stroke={C(0.1)} strokeWidth="2.1"/>
                            <circle cx="12" cy="12" r={R} fill="none" stroke="#34d399" strokeWidth="2.1" strokeDasharray={`${DA2} ${CIRC2}`} strokeLinecap="round" style={{transition:"stroke-dasharray 0.3s ease"}}/>
                          </svg>
                          );})()}
                          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                            {done
                              ?<div style={{width:13,height:13,backgroundColor:isDark?"#211c3d":"#fff",WebkitMaskImage:"url(/icons/check.svg)",maskImage:"url(/icons/check.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center",animation:"checkPop 0.35s ease"}}/>
                              :isFuture
                              ?<div style={{width:13,height:13,backgroundColor:C(0.35),WebkitMaskImage:"url(/icons/lock-outline.svg)",maskImage:"url(/icons/lock-outline.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center"}}/>
                              :<span style={{fontSize:8,fontWeight:700,color:C(0.6),lineHeight:1}}>{doneCount}/{t.timesPerDay}</span>}
                          </div>
                        </button>
                      ):(
                      <button onClick={e=>{ if(isFuture) return; e.currentTarget.blur(); toggleDone(t.id,selDay); }} style={{
                        width:24,height:24,borderRadius:"50%",flexShrink:0,padding:0,boxSizing:"border-box",overflow:"hidden",
                        border:done?"none":`2px solid ${C(0.2)}`,
                        background:done?"linear-gradient(135deg,#34d399,#6ee7b7)":S(0.04),
                        cursor:isFuture?"not-allowed":"pointer",
                        display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s",
                      }}>
                        {done&&<div style={{width:13,height:13,backgroundColor:isDark?"#211c3d":"#fff",WebkitMaskImage:"url(/icons/check.svg)",maskImage:"url(/icons/check.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center",animation:"checkPop 0.35s ease"}}/>}
                        {!done&&isFuture&&<div style={{width:13,height:13,backgroundColor:C(0.35),WebkitMaskImage:"url(/icons/lock-outline.svg)",maskImage:"url(/icons/lock-outline.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center"}}/>}
                      </button>
                      )}
                      {/* Text */}
                      <div style={{flex:1,minWidth:0,opacity:done?.4:1,transition:"opacity 0.2s"}}>
                        <div style={{color:C(0.9),fontSize:16,fontWeight:400,lineHeight:1.3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.text}</div>
                        <div style={{display:"flex",justifyContent:"flex-start",width:"fit-content",maxWidth:"100%",gap:6,marginTop:4,alignItems:"center",flexWrap:"nowrap",overflow:"hidden"}}>
                          {people.length>1&&(()=>{
                            const pIds=(t.personIds||[t.personId]).filter(Boolean);
                            if(pIds.length===people.length) return <span style={{fontSize:13,color:"#cbd5e1",fontWeight:600,whiteSpace:"nowrap",flexShrink:0}}>{tr("all")}</span>;
                            if(pIds.length>1){
                              const p=getPerson(pIds[0]);
                              return <span style={{fontSize:13,color:p?.color||C(0.55),fontWeight:600,whiteSpace:"nowrap",flexShrink:0}}>{p?.name} +{pIds.length-1}</span>;
                            }
                            const p=getPerson(pIds[0]);
                            return <span style={{fontSize:13,color:p?.color||C(0.55),fontWeight:600,whiteSpace:"nowrap",flexShrink:0}}>{p?.name}</span>;
                          })()}
                          {people.length>1&&<div style={{width:4,height:4,borderRadius:"50%",background:C(0.2),flexShrink:0}}/>}
                          <span style={{fontSize:13,color:TEXT3,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"block",flex:"0 1 auto"}}>{zone?.label}</span>
                          {t.estMinutes&&<>
                            <div style={{width:4,height:4,borderRadius:"50%",background:C(0.2),flexShrink:0}}/>
                            <span style={{fontSize:13,color:TEXT3,flexShrink:0}}>{formatEstMinutes(t.estMinutes)}</span>
                          </>}
                          {streak>1&&<>
                            <div style={{width:4,height:4,borderRadius:"50%",background:C(0.2),flexShrink:0}}/>
                            <span style={{fontSize:13,color:"#fbbf24",display:"flex",alignItems:"center",gap:2,whiteSpace:"nowrap",flexShrink:0}}><div style={{width:13,height:13,backgroundColor:"#fbbf24",WebkitMaskImage:"url(/icons/streak-fill.svg)",maskImage:"url(/icons/streak-fill.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center"}}/>{streak}</span>
                          </>}
                          {t.rescheduledFrom&&<>
                            <div style={{width:4,height:4,borderRadius:"50%",background:C(0.2),flexShrink:0}}/>
                            <div style={{width:12,height:12,backgroundColor:"rgba(251,191,36,0.8)",flexShrink:0,WebkitMaskImage:"url(/icons/moved-outline.svg)",maskImage:"url(/icons/moved-outline.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center"}}/>
                          </>}
                        </div>
                      </div>
                      {/* Like */}
                      <button onClick={e=>{e.stopPropagation();likeTask(t.id,selDay);}} style={{
                        position:"relative",
                        background:"none",
                        border:"none",
                        width:28,height:28,cursor:"pointer",
                        display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s",flexShrink:0,padding:0,
                      }}>
                        <div style={{width:24,height:24,backgroundColor:likeCount>0?"#f87171":C(0.35),WebkitMaskImage:`url(/icons/heart-${likeCount>0?"fill":"outline"}.svg)`,maskImage:`url(/icons/heart-${likeCount>0?"fill":"outline"}.svg)`,WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center",animation:justLiked===(t.id+"|"+selDay)?"heartPop 0.4s ease":"none"}}/>
                        {likeCount>1&&<span style={{position:"absolute",top:-4,right:-4,background:"#f87171",borderRadius:"50%",...(likeCount<10?{width:18,height:18}:{minWidth:18,height:18,padding:"0 4px"}),fontSize:11,fontWeight:700,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}>{likeCount}</span>}
                      </button>
                      {/* Avatar(s) */}
                      {(()=>{
                        const pIds=(t.personIds||[t.personId]).filter(Boolean);
                        if(pIds.length===0) return(
                          <div style={{opacity:done?.4:1,width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                            <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
                              <circle cx="15.5" cy="8.5" r="4.2" fill="#94a3b8" opacity="0.55"/>
                              <path d="M15.5 14.3c-3.6 0-6.5 2.4-6.9 5.7h13.8c-0.4-3.3-3.3-5.7-6.9-5.7z" fill="#94a3b8" opacity="0.55"/>
                              <circle cx="9" cy="9.5" r="4.8" fill="#94a3b8"/>
                              <path d="M9 15.7c-4.1 0-7.5 2.7-7.9 6.5h15.8c-0.4-3.8-3.8-6.5-7.9-6.5z" fill="#94a3b8"/>
                            </svg>
                          </div>
                        );
                        if(pIds.length===1) return(
                          <div style={{opacity:done?.4:1,transition:"opacity 0.2s",flexShrink:0}}>
                            <Avatar person={getPerson(pIds[0])} size={28}/>
                          </div>
                        );
                        return(
                          <div style={{opacity:done?.4:1,width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                            <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
                              <circle cx="15.5" cy="8.5" r="4.2" fill="#94a3b8" opacity="0.55"/>
                              <path d="M15.5 14.3c-3.6 0-6.5 2.4-6.9 5.7h13.8c-0.4-3.3-3.3-5.7-6.9-5.7z" fill="#94a3b8" opacity="0.55"/>
                              <circle cx="9" cy="9.5" r="4.8" fill="#94a3b8"/>
                              <path d="M9 15.7c-4.1 0-7.5 2.7-7.9 6.5h15.8c-0.4-3.8-3.8-6.5-7.9-6.5z" fill="#94a3b8"/>
                            </svg>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══ CALENDAR ══════════════════════════════════════════ */}
          {tab==="calendar"&&(()=>{
            const firstDay=new Date(calYear,calMonth,1);
            const lastDay=new Date(calYear,calMonth+1,0);
            const startOff=(firstDay.getDay()+6)%7;
            const cells=[];
            for(let i=0;i<startOff;i++) cells.push(null);
            for(let d=1;d<=lastDay.getDate();d++) cells.push(new Date(calYear,calMonth,d));
            const mName=firstDay.toLocaleDateString("en-US",{month:"long",year:"numeric"});
            const sDayTasks=dayTasks(selDay).filter(t=>myFilter?t.personId===meId:true);
            const sPast=selDay<todayStr,sToday=selDay===todayStr;
            const sDone=sDayTasks.filter(t=>isDone(t,selDay)).length;
            const sTotal=sDayTasks.length;
            const sPct=sTotal===0?0:Math.round(sDone/sTotal*100);
            return (
              <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
                <div style={{flexShrink:0,padding:"16px 16px 16px"}}>
                <div style={{color:TEXT1,fontFamily:"'SF Pro Display',-apple-system,sans-serif",fontSize:28,lineHeight:"34px",fontWeight:700,marginBottom:16}}>{tr("header_calendar")}</div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                  <button
                    onTouchStart={e=>{e.preventDefault();pressStart("cal-prev",setPressedCalArrow,"prev");}} onTouchEnd={e=>{e.preventDefault();setCalSlideDir(-1);const d=new Date(calYear,calMonth-1,1);setCalYear(d.getFullYear());setCalMonth(d.getMonth());pressEnd("cal-prev",setPressedCalArrow,null);}} onTouchCancel={()=>pressEnd("cal-prev",setPressedCalArrow,null)}
                    onMouseDown={()=>pressStart("cal-prev",setPressedCalArrow,"prev")} onMouseUp={()=>{setCalSlideDir(-1);const d=new Date(calYear,calMonth-1,1);setCalYear(d.getFullYear());setCalMonth(d.getMonth());pressEnd("cal-prev",setPressedCalArrow,null);}} onMouseLeave={()=>pressEnd("cal-prev",setPressedCalArrow,null)}
                    style={{background:"none",border:"none",width:36,height:36,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}><div style={{width:24,height:24,backgroundColor:TEXT2,WebkitMaskImage:"url(/icons/left.svg)",maskImage:"url(/icons/left.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center",transform:pressedCalArrow==="prev"?"scale(1.4)":"scale(1)",transition:pressedCalArrow==="prev"?"transform 0.1s ease-out":"transform 0.4s cubic-bezier(0.34,1.56,0.64,1)"}}/></button>
                  <div style={{color:TEXT1,fontSize:16,fontWeight:700}}>{calScrolled?dayLabel(selDay):mName}</div>
                  <button
                    onTouchStart={e=>{e.preventDefault();pressStart("cal-next",setPressedCalArrow,"next");}} onTouchEnd={e=>{e.preventDefault();setCalSlideDir(1);const d=new Date(calYear,calMonth+1,1);setCalYear(d.getFullYear());setCalMonth(d.getMonth());pressEnd("cal-next",setPressedCalArrow,null);}} onTouchCancel={()=>pressEnd("cal-next",setPressedCalArrow,null)}
                    onMouseDown={()=>pressStart("cal-next",setPressedCalArrow,"next")} onMouseUp={()=>{setCalSlideDir(1);const d=new Date(calYear,calMonth+1,1);setCalYear(d.getFullYear());setCalMonth(d.getMonth());pressEnd("cal-next",setPressedCalArrow,null);}} onMouseLeave={()=>pressEnd("cal-next",setPressedCalArrow,null)}
                    style={{background:"none",border:"none",width:36,height:36,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}><div style={{width:24,height:24,backgroundColor:TEXT2,WebkitMaskImage:"url(/icons/right.svg)",maskImage:"url(/icons/right.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center",transform:pressedCalArrow==="next"?"scale(1.4)":"scale(1)",transition:pressedCalArrow==="next"?"transform 0.1s ease-out":"transform 0.4s cubic-bezier(0.34,1.56,0.64,1)"}}/></button>
                </div>
                </div>
                <div style={{flex:1,overflowY:"auto",padding:"0 16px 110px"}} onScroll={e=>{
                  const gridBottom=calGridRef.current?calGridRef.current.offsetTop+calGridRef.current.offsetHeight:0;
                  setCalScrolled(e.currentTarget.scrollTop>gridBottom-140);
                }}>
                <div ref={calGridRef} key={`${calYear}-${calMonth}`} style={{animation:calSlideDir===1?"calSlideFromRight 0.25s ease":calSlideDir===-1?"calSlideFromLeft 0.25s ease":"none"}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:6}}>
                  {["Mo","Tu","We","Th","Fr","Sa","Su"].map(d=><div key={d} style={{textAlign:"center",color:TEXT3,fontSize:12,fontWeight:700}}>{d}</div>)}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:12}}>
                  {cells.map((d,i)=>{
                    if(!d) return <div key={"e"+i}/>;
                    const dStr=ds(d),cnt=dayTasks(dStr).length;
                    const dCnt=dayTasks(dStr).filter(t=>isDone(t,dStr)).length;
                    const isT=dStr===todayStr,iP=dStr<todayStr,iS=selDay===dStr;
                    const allD=cnt>0&&dCnt===cnt,hasMiss=iP&&cnt>0&&dCnt<cnt;
                    return (
                      <div key={dStr} onClick={()=>setSelDay(dStr)} style={{borderRadius:10,aspectRatio:"1",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,cursor:"pointer",transition:"all 0.15s",
                        background:iS?`linear-gradient(135deg,${ACCENT},${ACCENT2})`:isT?"rgba(99,102,241,0.18)":S(0.04),
                        border:iS?`1px solid ${C(0.2)}`:isT?"1px solid rgba(99,102,241,0.4)":"1px solid transparent",
                        boxShadow:iS?"0 4px 16px rgba(99,102,241,0.35)":"none"}}>
                        <span style={{fontSize:14,fontWeight:iS||isT?700:400,color:iS?"#fff":isT?ACCENT:iP?C(0.38):C(0.7)}}>{d.getDate()}</span>
                        {cnt>0&&<div style={{width:6,height:6,borderRadius:"50%",background:iS?S(0.8):allD?"#34d399":hasMiss?"#f87171":ACCENT}}/>}
                      </div>
                    );
                  })}
                </div>
                <div style={{display:"flex",gap:14,marginBottom:18,justifyContent:"center"}}>
                  {[["#34d399","All done"],["#f87171","Missed"],[ACCENT,"Planned"]].map(([c,l])=>(
                    <div key={l} style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:c}}/>
                      <span style={{color:TEXT3,fontSize:12}}>{l}</span>
                    </div>
                  ))}
                </div>
                </div>
                <div style={{...CARD}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:10}}>
                    <span style={{color:TEXT3,fontSize:12}}>{dayLabel(selDay)}</span>
                    {sTotal>0&&<span style={{color:sPct===100?"#34d399":TEXT3,fontSize:12,fontWeight:600}}>
                      {sPct===100?(<span style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:12,height:12,backgroundColor:"#34d399",WebkitMaskImage:"url(/icons/check.svg)",maskImage:"url(/icons/check.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center"}}/>All done!</span>):`${sDone} of ${sTotal}`}
                    </span>}
                  </div>
                  {sTotal>0&&(
                    <div style={{marginBottom:10}}>
                      <div style={{background:S(0.06),borderRadius:4,height:4,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${sPct}%`,borderRadius:4,transition:"width 0.4s ease",background:sPct===100?"linear-gradient(90deg,#34d399,#6ee7b7)":sPast?"linear-gradient(90deg,#f87171,#fca5a5)":`linear-gradient(90deg,${ACCENT},#a78bfa)`}}/>
                      </div>
                    </div>
                  )}
                  {sDayTasks.length===0?<div style={{color:TEXT4,fontSize:13,textAlign:"center",padding:"10px 0"}}>No tasks</div>
                  :sDayTasks.map((t,ti)=>{
                    const done=isDone(t,selDay),missed=sPast&&!done,isFutureDay=selDay>todayStr,person=getPerson(t.personId),zone=getZone(t.zone);
                    return (
                      <div key={t.id} onClick={()=>{if(isFutureDay)return;toggleDone(t.id,selDay);}} style={{display:"flex",alignItems:"center",gap:10,padding:ti===sDayTasks.length-1?"8px 0 0":"8px 0",borderBottom:ti<sDayTasks.length-1?`1px solid ${S(0.08)}`:"none",cursor:isFutureDay?"default":"pointer"}}>
                        <button onClick={e=>{e.stopPropagation();if(isFutureDay)return;toggleDone(t.id,selDay);}} style={{width:18,height:18,borderRadius:"50%",flexShrink:0,padding:0,boxSizing:"border-box",border:(!done&&!missed&&!isFutureDay&&(t.timesPerDay||1)>1)?"none":`2px solid ${done?"#34d399":missed?"rgba(248,113,113,0.5)":isFutureDay?C(0.08):C(0.15)}`,background:done?"#34d399":missed?"rgba(248,113,113,0.1)":"transparent",cursor:isFutureDay?"not-allowed":"pointer",position:"relative",display:"flex",alignItems:"center",justifyContent:"center"}}>
                          {!done&&!missed&&!isFutureDay&&(t.timesPerDay||1)>1&&(()=>{ const R=8.1,CIRC3=2*Math.PI*R,frac=Math.min(1,doneCountOn(t,selDay)/(t.timesPerDay||1)); return (
                          <svg viewBox="0 0 18 18" style={{position:"absolute",inset:0,width:"100%",height:"100%",transform:"rotate(-90deg)",overflow:"visible"}}>
                            <circle cx="9" cy="9" r={R} fill="none" stroke={C(0.1)} strokeWidth="1.8"/>
                            <circle cx="9" cy="9" r={R} fill="none" stroke="#34d399" strokeWidth="1.8" strokeDasharray={`${frac*CIRC3} ${CIRC3}`} strokeLinecap="round" style={{transition:"stroke-dasharray 0.3s ease"}}/>
                          </svg>
                          );})()}
                          {done&&<div style={{width:10,height:10,backgroundColor:"#fff",WebkitMaskImage:"url(/icons/check.svg)",maskImage:"url(/icons/check.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center",position:"relative"}}/>}
                          {missed&&<div style={{width:10,height:10,backgroundColor:"rgba(248,113,113,0.7)",WebkitMaskImage:"url(/icons/cross.svg)",maskImage:"url(/icons/cross.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center",position:"relative"}}/>}
                          {!done&&!missed&&isFutureDay&&<div style={{width:8,height:8,backgroundColor:C(0.45),WebkitMaskImage:"url(/icons/lock-outline.svg)",maskImage:"url(/icons/lock-outline.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center",position:"relative"}}/>}
                        </button>
                        <div style={{flex:1}}>
                          <div style={{color:done?C(0.38):missed?"rgba(248,113,113,0.6)":C(0.82),fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.text}</div>
                          <div style={{color:TEXT3,fontSize:12,marginTop:2}}>{zone?.label}</div>
                        </div>
                        <Avatar person={person} size={24}/>
                      </div>
                    );
                  })}
                </div>
              </div>
                </div>
            );
          })()}

          {/* ══ ADD TASK ══════════════════════════════════════════ */}
          {taskFormOpen&&(
          <div onClick={closeTaskForm} style={{position:"absolute",inset:0,zIndex:400,display:"flex",alignItems:"flex-end",background:"rgba(0,0,0,0.5)",backdropFilter:"blur(4px)"}}>
            <div onClick={e=>e.stopPropagation()} style={{width:"100%",height:"96%",background:THEME_COLORS[theme].bg,borderRadius:"24px 24px 0 0",boxShadow:"0 -20px 60px rgba(0,0,0,0.5)",display:"flex",flexDirection:"column",overflow:"hidden",transform:`translateY(${taskFormVisible?sheetDragY:1000}px)`,transition:sheetDragY===0?"transform 0.32s cubic-bezier(0.32,0.72,0,1)":"none"}}>
            <div onTouchStart={e=>{ sheetDragRef.current={startY:e.touches[0].clientY,dy:0}; }} onTouchMove={e=>{ if(!sheetDragRef.current) return; const dy=e.touches[0].clientY-sheetDragRef.current.startY; if(dy>0){ sheetDragRef.current.dy=dy; setSheetDragY(dy); } }} onTouchEnd={()=>{ if(sheetDragRef.current&&sheetDragRef.current.dy>90){ closeTaskForm(); } setSheetDragY(0); sheetDragRef.current=null; }} style={{flexShrink:0,paddingTop:6,paddingBottom:4}}>
              <div style={{width:36,height:4,background:S(0.2),borderRadius:2,margin:"4px auto 0"}}/>
              <div style={{padding:"10px 16px 0",color:C(0.88),fontFamily:"'SF Pro Display',-apple-system,sans-serif",fontSize:28,lineHeight:"34px",fontWeight:700}}>{editTaskId?tr("edit_task"):tr("new_task")}</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",flex:1,minHeight:0}}>
              {editTaskId&&(()=>{const et=tasks.find(x=>x.id===editTaskId);return et?.rescheduledFrom?(
                <div style={{margin:"0 20px 8px",color:"#fbbf24",fontSize:12,display:"flex",alignItems:"center",gap:6}}>
                  <span>⏭️</span><span>Moved from {new Date(et.rescheduledFrom+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
                </div>
              ):null;})()}
              <div style={{flex:1,overflowY:"auto",overflowX:"hidden",padding:"8px 16px 110px"}}>
              <div style={{display:"flex",flexDirection:"column",gap:22}}>
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:8}}>
                    <span style={labelSt}>{tr("what_to_do")}</span>
                    <span style={{fontSize:11,color:form.text.length>=form.maxLen?"#f87171":form.text.length>form.maxLen*0.8?"#fbbf24":C(0.3)}}>{form.text.length}/{form.maxLen}</span>
                  </div>
                  <input ref={taskNameRef} className={`std-input${taskNameError?" input-error":""}`} type="text" maxLength={form.maxLen} value={form.text} onChange={e=>{setForm(f=>({...f,text:e.target.value.slice(0,f.maxLen)}));if(e.target.value.trim())setTaskNameError(false);}} placeholder="e.g. wash the sink" style={{...inputSt,border:taskNameError?"2px solid #f87171":`1px solid ${C(0.1)}`}}/></div>
                <div>
                  <span style={labelSt}>{tr("zone")}</span>
                  <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                    {zones.map(z=>{const sel=form.zone===z.id; return (
                      <button key={z.id} onClick={()=>setForm(f=>({...f,zone:z.id}))} style={{position:"relative",display:"flex",alignItems:"center",gap:6,background:sel?"rgba(129,140,248,0.28)":S(0.05),border:"none",borderRadius:20,height:40,boxSizing:"border-box",padding:"0 16px",cursor:"pointer",color:sel?"#fff":TEXT2,fontSize:14}}>
                        <div style={{position:"absolute",inset:0,borderRadius:20,border:`${sel?"2px":"1px"} solid ${sel?ACCENT:S(0.1)}`,pointerEvents:"none"}}/>
                        {z.emoji} {z.label}
                      </button>
                    );})}
                  </div>
                </div>
                <div>
                  <span style={labelSt}>{tr("frequency")}</span>
                  <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                    {FREQ_OPTIONS.map(f=>{const sel=form.freq===f.id; return (
                      <button key={f.id} onClick={()=>setForm(fm=>({...fm,freq:(f.id==="custom"&&fm.freq==="custom")?"daily":f.id}))} style={{position:"relative",background:sel?FREQ_COLOR[f.id]+"25":S(0.05),border:"none",borderRadius:20,height:40,boxSizing:"border-box",padding:"0 16px",cursor:"pointer",color:sel?FREQ_COLOR[f.id]:TEXT2,fontSize:14,fontWeight:500}}>
                        <div style={{position:"absolute",inset:0,borderRadius:20,border:`${sel?"2px":"1px"} solid ${sel?FREQ_COLOR[f.id]+"60":S(0.1)}`,pointerEvents:"none"}}/>
                        {f.label}
                      </button>
                    );})}
                  </div>
                  {form.freq==="custom"&&(
                    <div style={{display:"flex",alignItems:"center",gap:10,...G(0.08,20),borderRadius:14,padding:"12px 16px",marginTop:8,border:"1px solid rgba(232,121,249,0.3)"}}>
                      <span style={{color:TEXT2,fontSize:14}}>Every</span>
                      <input type="number" min="1" max="365" value={form.customDays===0?"":form.customDays} onChange={e=>{const v=e.target.value;setForm(f=>({...f,customDays:v===""?0:Math.max(1,parseInt(v)||1)}));}} onBlur={e=>{if(!form.customDays||form.customDays<1)setForm(f=>({...f,customDays:2}));}} style={{background:"rgba(255,255,255,0.1)",borderRadius:10,border:`1px solid ${C(0.1)}`,padding:"0 10px",height:40,boxSizing:"border-box",color:C(0.9),fontWeight:700,fontSize:16,width:60,textAlign:"center"}}/>
                      <span style={{color:TEXT2,fontSize:14}}>days</span>
                    </div>
                  )}
                </div>

                <div>
                  <span style={labelSt}>How many times per day?</span>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <button onClick={()=>setForm(f=>({...f,timesPerDay:Math.max(1,(f.timesPerDay||1)-1)}))} style={{width:34,height:34,borderRadius:10,border:"none",background:S(0.08),color:TEXT2,fontSize:18,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1}}>−</button>
                    <span style={{color:"#fff",fontSize:16,fontWeight:700,minWidth:20,textAlign:"center"}}>{form.timesPerDay||1}</span>
                    <button onClick={()=>setForm(f=>({...f,timesPerDay:Math.min(5,(f.timesPerDay||1)+1)}))} style={{width:34,height:34,borderRadius:10,border:"none",background:S(0.08),color:TEXT2,fontSize:18,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1}}>+</button>
                    {(form.timesPerDay||1)>1&&<span style={{color:C(0.4),fontSize:12}}>Shows as {form.timesPerDay} checkmarks per day</span>}
                  </div>
                </div>

                <div>
                  <span style={labelSt}>Estimated time (optional)</span>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {[null,5,10,15,30,45,60].map(min=>{const sel=!customTimeOpen&&form.estMinutes===min; return (
                      <button key={min??"none"} onClick={()=>{setCustomTimeOpen(false);setForm(f=>({...f,estMinutes:min}));}} style={{
                        position:"relative",background:sel?"rgba(129,140,248,0.28)":S(0.05),
                        border:"none",height:40,boxSizing:"border-box",
                        borderRadius:20,padding:"0 16px",cursor:"pointer",
                        color:sel?"#fff":TEXT2,fontSize:14,fontWeight:500,
                      }}>
                        <div style={{position:"absolute",inset:0,borderRadius:20,border:`${sel?"2px":"1px"} solid ${sel?ACCENT:S(0.1)}`,pointerEvents:"none"}}/>
                        {min==null?"None":min<60?`${min} min`:"1 hr"}
                      </button>
                    );})}
                    <button onClick={()=>{
                      if(customTimeOpen){ setCustomTimeOpen(false); return; } // tap again to collapse
                      setCustomTimeOpen(true);
                      const presets=[null,5,10,15,30,45,60];
                      if(presets.includes(form.estMinutes)) setForm(f=>({...f,estMinutes:10}));
                    }} style={{
                      position:"relative",background:customTimeOpen?"rgba(129,140,248,0.28)":S(0.05),
                      border:"none",height:40,boxSizing:"border-box",
                      borderRadius:20,padding:"0 16px",cursor:"pointer",
                      color:customTimeOpen?"#fff":TEXT2,fontSize:14,fontWeight:500,
                    }}>
                      <div style={{position:"absolute",inset:0,borderRadius:20,border:`${customTimeOpen?"2px":"1px"} solid ${customTimeOpen?ACCENT:S(0.1)}`,pointerEvents:"none"}}/>
                      Custom
                    </button>
                  </div>
                  {customTimeOpen&&(()=>{ const totalMin=form.estMinutes||10,h=Math.floor(totalMin/60),m=totalMin%60; return (
                    <div style={{display:"flex",alignItems:"center",gap:10,marginTop:10}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <button onClick={()=>setForm(f=>({...f,estMinutes:Math.max(0,totalMin-60)}))} style={{width:30,height:30,borderRadius:8,border:"none",background:S(0.08),color:TEXT2,fontSize:16,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1}}>−</button>
                        <span style={{color:"#fff",fontSize:14,fontWeight:700,minWidth:44,textAlign:"center"}}>{h}h</span>
                        <button onClick={()=>setForm(f=>({...f,estMinutes:totalMin+60}))} style={{width:30,height:30,borderRadius:8,border:"none",background:S(0.08),color:TEXT2,fontSize:16,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1}}>+</button>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <button onClick={()=>setForm(f=>({...f,estMinutes:Math.max(0,totalMin-5)}))} style={{width:30,height:30,borderRadius:8,border:"none",background:S(0.08),color:TEXT2,fontSize:16,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1}}>−</button>
                        <span style={{color:"#fff",fontSize:14,fontWeight:700,minWidth:44,textAlign:"center"}}>{m}m</span>
                        <button onClick={()=>setForm(f=>({...f,estMinutes:totalMin+5}))} style={{width:30,height:30,borderRadius:8,border:"none",background:S(0.08),color:TEXT2,fontSize:16,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1}}>+</button>
                      </div>
                    </div>
                  );})()}
                </div>

                <div style={{width:"100%",maxWidth:"100%",overflow:"hidden",boxSizing:"border-box"}}>
                  <span style={labelSt}>{tr("start_date")}</span>
                  <input type="date" value={form.startDate} min={todayStr}
                    onChange={e=>setForm(f=>({...f,startDate:e.target.value}))}
                    className="std-input" style={{...inputSt,colorScheme:"dark",width:"auto",maxWidth:"100%",boxSizing:"border-box",display:"flex",alignItems:"center",justifyContent:"center",textAlign:"center"}}/>
                </div>
                {people.length>1&&(
                <div>
                  <span style={labelSt}>{tr("assigned_to")}</span>
                  <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}}>
                    <button onClick={()=>setForm(f=>({...f,personIds:(f.personIds||[]).length===people.length?[meId]:people.map(p=>p.id)}))} style={{
                      display:"flex",alignItems:"center",height:34,boxSizing:"border-box",
                      background:(form.personIds||[]).length===people.length?S(0.15):S(0.05),
                      border:`2px solid ${(form.personIds||[]).length===people.length?C(0.4):C(0.08)}`,
                      borderRadius:20,padding:"0 16px",cursor:"pointer",
                    }}>
                      <span style={{color:(form.personIds||[]).length===people.length?C(0.9):C(0.4),fontSize:13,fontWeight:500}}>{tr("all")}</span>
                    </button>
                    {people.map(p=>{
                      const isAll=(form.personIds||[]).length===people.length;
                      const sel=(form.personIds||[]).includes(p.id)&&!isAll;
                      return <button key={p.id} onClick={()=>setForm(f=>{
                        if(people.length===2){
                          // With exactly two people, this is a simple 3-way choice
                          // (Person A / Person B / All) — picking one always just
                          // replaces the selection, no ambiguous partial state.
                          return {...f,personIds:[p.id]};
                        }
                        const cur=f.personIds||[];
                        if(cur.includes(p.id)&&cur.length===1) return f; // can't deselect the last remaining person
                        const next=cur.includes(p.id)?cur.filter(id=>id!==p.id):[...cur,p.id];
                        return {...f,personIds:next};
                      })} style={{display:"flex",alignItems:"center",gap:7,height:34,boxSizing:"border-box",background:sel?p.color+"28":S(0.05),border:`2px solid ${sel?p.color+"90":C(0.08)}`,borderRadius:20,padding:"0 14px 0 6px",cursor:"pointer",position:"relative"}}>
                        <Avatar person={p} size={20}/>
                        <span style={{color:sel?p.color:TEXT3,fontSize:13,fontWeight:500}}>{p.name}</span>
                      </button>;
                    })}
                  </div>
                </div>
                )}
                <button onClick={saveTask} disabled={savingTask} style={{background:`linear-gradient(135deg,${ACCENT},${ACCENT2})`,border:"none",borderRadius:16,height:50,boxSizing:"border-box",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:16,lineHeight:"18px",fontWeight:600,cursor:savingTask?"default":"pointer",marginTop:4,opacity:savingTask?0.6:1}}>{savingTask?(lang==="ru"?"Сохранение…":"Saving…"):editTaskId?tr("save_changes"):tr("add_task")}</button>
                <button onClick={closeTaskForm} style={{background:"none",border:"none",color:C(0.3),fontSize:14,cursor:"pointer",padding:"6px"}}>Cancel</button>
              </div>
              </div>
            </div>
            </div>
          </div>
          )}

          {/* ══ ALL TASKS ══════════════════════════════════════════ */}
          {tab==="tasks"&&(
            <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
              <div style={{flexShrink:0,padding:"16px 16px 16px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                <div style={{color:C(0.88),fontFamily:"'SF Pro Display',-apple-system,sans-serif",fontSize:28,lineHeight:"34px",fontWeight:700}}>{tr("header_alltasks")}</div>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <button
                    onTouchStart={e=>{e.preventDefault();pressStart("addzone",setPressedAddZone,true);}} onTouchEnd={e=>{e.preventDefault();setZoneNameError(false);setZForm({label:"",emoji:"🏠"});setEmojiPicker(false);setZoneExpandId("__new__");pressEnd("addzone",setPressedAddZone,false);}} onTouchCancel={()=>pressEnd("addzone",setPressedAddZone,false)}
                    onMouseDown={()=>pressStart("addzone",setPressedAddZone,true)} onMouseUp={()=>{setZoneNameError(false);setZForm({label:"",emoji:"🏠"});setEmojiPicker(false);setZoneExpandId("__new__");pressEnd("addzone",setPressedAddZone,false);}} onMouseLeave={()=>pressEnd("addzone",setPressedAddZone,false)}
                    style={{position:"relative",display:"flex",alignItems:"center",gap:8,height:40,background:S(0.05),border:"none",borderRadius:20,padding:"12px 16px 12px 12px",cursor:"pointer"}}>
                    <div style={{position:"absolute",inset:0,borderRadius:20,border:`1px solid ${S(0.1)}`,pointerEvents:"none"}}/>
                    <div style={{display:"flex",alignItems:"center",gap:6,transform:pressedAddZone?"scale(1.06)":"scale(1)",transition:pressedAddZone?"transform 0.1s ease-out":"transform 0.4s cubic-bezier(0.34,1.56,0.64,1)"}}>
                      <div style={{width:18,height:18,backgroundColor:ACCENT,WebkitMaskImage:"url(/icons/plus-outline.svg)",maskImage:"url(/icons/plus-outline.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center"}}/>
                      <span style={{color:ACCENT,fontSize:14,fontWeight:500}}>Zone</span>
                    </div>
                  </button>
                  <button
                    onTouchStart={e=>{e.preventDefault();pressStart("stats",setPressedStats,true);}} onTouchEnd={e=>{e.preventDefault();setShowStats(true);pressEnd("stats",setPressedStats,false);}} onTouchCancel={()=>pressEnd("stats",setPressedStats,false)}
                    onMouseDown={()=>pressStart("stats",setPressedStats,true)} onMouseUp={()=>{setShowStats(true);pressEnd("stats",setPressedStats,false);}} onMouseLeave={()=>pressEnd("stats",setPressedStats,false)}
                    style={{position:"relative",background:"none",border:"none",width:24,height:24,padding:0,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
                    <div style={{width:24,height:24,backgroundColor:"#fbbf24",WebkitMaskImage:"url(/icons/trophy-fill.svg)",maskImage:"url(/icons/trophy-fill.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center",transform:pressedStats?"scale(1.22)":"scale(1)",transition:pressedStats?"transform 0.1s ease-out":"transform 0.4s cubic-bezier(0.34,1.56,0.64,1)"}}/>
                  </button>
                </div>
              </div>
              </div>
              <div style={{flexShrink:0,padding:"0 16px 24px"}}>
              <div style={{display:"flex",gap:0,padding:2,background:isDark?"rgba(78,82,135,0.5)":"rgba(255,255,255,0.6)",border:isDark?"1px solid #494D68":"1px solid rgba(255,255,255,1)",borderRadius:22,overflowX:"auto",msOverflowStyle:"none",scrollbarWidth:"none"}}>
                <button
                  onTouchStart={e=>{pressStart("tf-all",setPressedFilter,"tf-all",e);}}
                  onTouchEnd={e=>{if(!wasScrolled("tf-all",e)){e.preventDefault();setTaskZoneFilter(null);}pressEnd("tf-all",setPressedFilter,null);}}
                  onTouchCancel={()=>pressEnd("tf-all",setPressedFilter,null)}
                  onMouseDown={()=>pressStart("tf-all",setPressedFilter,"tf-all")}
                  onMouseUp={()=>{setTaskZoneFilter(null);pressEnd("tf-all",setPressedFilter,null);}}
                  onMouseLeave={()=>pressEnd("tf-all",setPressedFilter,null)}
                  style={{position:"relative",flexShrink:0,height:36,border:"none",padding:"0 16px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",background:"transparent"}}>
                  <div style={{position:"absolute",inset:0,borderRadius:18,background:"rgba(129,140,248,0.28)",border:`1.5px solid ${ACCENT}`,opacity:taskZoneFilter===null?1:0,transition:"opacity 0.2s ease"}}/>
                  <span style={{position:"relative",fontSize:14,fontWeight:500,color:taskZoneFilter===null?"#fff":TEXT2,whiteSpace:"nowrap",display:"inline-block",transform:pressedFilter==="tf-all"?"scale(1.1)":"scale(1)",transition:pressedFilter==="tf-all"?"transform 0.1s ease-out":"transform 0.4s cubic-bezier(0.34,1.56,0.64,1)"}}>{tr("all")}</span>
                </button>
                {zones.map(z=>(
                  <button key={z.id}
                    onTouchStart={e=>{pressStart("tf"+z.id,setPressedFilter,"tf"+z.id,e);}}
                    onTouchEnd={e=>{if(!wasScrolled("tf"+z.id,e)){e.preventDefault();setTaskZoneFilter(taskZoneFilter===z.id?null:z.id);}pressEnd("tf"+z.id,setPressedFilter,null);}}
                    onTouchCancel={()=>pressEnd("tf"+z.id,setPressedFilter,null)}
                    onMouseDown={()=>pressStart("tf"+z.id,setPressedFilter,"tf"+z.id)}
                    onMouseUp={()=>{setTaskZoneFilter(taskZoneFilter===z.id?null:z.id);pressEnd("tf"+z.id,setPressedFilter,null);}}
                    onMouseLeave={()=>pressEnd("tf"+z.id,setPressedFilter,null)}
                    style={{position:"relative",flexShrink:0,height:36,border:"none",padding:"0 16px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",background:"transparent"}}>
                    <div style={{position:"absolute",inset:0,borderRadius:18,background:"rgba(129,140,248,0.28)",border:`1.5px solid ${ACCENT}`,opacity:taskZoneFilter===z.id?1:0,transition:"opacity 0.2s ease"}}/>
                    <span style={{position:"relative",fontSize:14,fontWeight:500,color:taskZoneFilter===z.id?"#fff":TEXT2,whiteSpace:"nowrap",display:"inline-block",transform:pressedFilter==="tf"+z.id?"scale(1.1)":"scale(1)",transition:pressedFilter==="tf"+z.id?"transform 0.1s ease-out":"transform 0.4s cubic-bezier(0.34,1.56,0.64,1)"}}>{z.emoji} {z.label}</span>
                  </button>
                ))}
                </div>
              </div>
              <div style={{flex:1,overflowY:"auto",padding:"0 16px 110px"}}>
              {groupedZones.length===0?(
                <div style={{textAlign:"center",padding:"60px 0"}}>
                  <div style={{fontSize:44}}>📋</div>
                  <div style={{color:C(0.38),marginTop:10,fontSize:14}}>{tr("no_tasks_yet")}</div>
                </div>
              ):groupedZones.filter(zone=>!taskZoneFilter||zone.id===taskZoneFilter).map(zone=>{
                const editing=zoneExpandId===zone.id;
                return (
                <div key={zone.id} style={{marginBottom:24}}>
                  {editing?(
                    <div style={{...CARD,marginBottom:12}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                        <button onClick={()=>setEmojiPicker(v=>!v)} style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:12,width:40,height:40,fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,padding:0}}>{zForm.emoji}</button>
                        <input
                          className={`std-input${zoneNameError?" input-error":""}`}
                          value={zForm.label}
                          onChange={e=>{setZForm(f=>({...f,label:e.target.value.slice(0,38)}));if(e.target.value.trim())setZoneNameError(false);}}
                          placeholder="Zone name"
                          maxLength={38}
                          autoFocus
                          style={{flex:1,background:"rgba(255,255,255,0.1)",border:zoneNameError?"2px solid #f87171":`1px solid ${C(0.1)}`,color:C(0.9),fontSize:16,lineHeight:"18px",fontWeight:400,fontFamily:"inherit",outline:"none",padding:"0 12px",height:40,boxSizing:"border-box",borderRadius:12}}
                        />
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>{setZoneExpandId(null);setEmojiPicker(false);}} style={{flex:1,background:S(0.06),border:"none",borderRadius:12,padding:"10px",color:C(0.5),fontSize:13,fontWeight:600,cursor:"pointer"}}>Cancel</button>
                        <button onClick={()=>{deleteZone(zone.id);setZoneExpandId(null);}} style={{flex:1,background:"rgba(248,113,113,0.1)",border:"none",borderRadius:12,padding:"10px",color:"#f87171",fontSize:13,fontWeight:600,cursor:"pointer"}}>Delete</button>
                        <button onClick={()=>{saveZone();setZoneExpandId(null);}} style={{flex:1,background:`linear-gradient(135deg,${ACCENT},${ACCENT2})`,border:"none",borderRadius:12,height:50,boxSizing:"border-box",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:16,lineHeight:"18px",fontWeight:600,cursor:"pointer"}}>Save</button>
                      </div>
                    </div>
                  ):(
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                    <span style={{color:C(0.85),fontSize:16,fontWeight:700,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{zone.label}</span>
                    {zone.id!=="__orphaned__"&&(
                      <button onClick={()=>{setZoneNameError(false);setZForm({label:zone.label,emoji:zone.emoji});setEmojiPicker(false);setZoneExpandId(zone.id);}} style={{background:"none",border:"none",width:26,height:26,cursor:"pointer",flexShrink:0,padding:0}}><div style={{width:"100%",height:"100%",backgroundColor:ACCENT,WebkitMaskImage:"url(/icons/edit-outline.svg)",maskImage:"url(/icons/edit-outline.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center"}}/></button>
                    )}
                  </div>
                  )}
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {zone.tasks.map(t=>{
                      const pIds=(t.personIds||[t.personId]).filter(Boolean),open=expandId===t.id,streak=computeStreak(t);
                      return (
                        <div key={t.id} style={{...CARD,cursor:"pointer",overflow:"hidden",boxSizing:"border-box"}} onClick={()=>setExpandId(open?null:t.id)}>
                          <div style={{display:"flex",alignItems:"center",gap:10,minHeight:44}}>
                            {pIds.length===1?(
                              <Avatar person={getPerson(pIds[0])} size={32}/>
                            ):(
                              <div style={{width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                                <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                                  <circle cx="15.5" cy="8.5" r="4.2" fill="#94a3b8" opacity="0.55"/>
                                  <path d="M15.5 14.3c-3.6 0-6.5 2.4-6.9 5.7h13.8c-0.4-3.3-3.3-5.7-6.9-5.7z" fill="#94a3b8" opacity="0.55"/>
                                  <circle cx="9" cy="9.5" r="4.8" fill="#94a3b8"/>
                                  <path d="M9 15.7c-4.1 0-7.5 2.7-7.9 6.5h15.8c-0.4-3.8-3.8-6.5-7.9-6.5z" fill="#94a3b8"/>
                                </svg>
                              </div>
                            )}
                            <div style={{flex:1}}>
                              <div style={{color:C(0.9),fontSize:15,fontWeight:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%"}}>{t.text}</div>
                              <div style={{display:"flex",gap:6,marginTop:2,alignItems:"center"}}>
                                <span style={{color:freqColorFor(t),fontSize:13}}>{freqLabelFor(t)}{(t.timesPerDay||1)>1?` ×${t.timesPerDay}`:""}</span>
                                {people.length>1&&(()=>{
                                  if(pIds.length===people.length) return <span style={{color:C(0.5),fontSize:13}}>· <span style={{color:"#cbd5e1",fontWeight:600}}>{tr("all")}</span></span>;
                                  const p=getPerson(pIds[0]);
                                  if(pIds.length>1) return <span style={{color:C(0.5),fontSize:13}}>· <span style={{color:p?.color,fontWeight:600}}>{p?.name} +{pIds.length-1}</span></span>;
                                  return <span style={{color:C(0.5),fontSize:13}}>· <span style={{color:p?.color,fontWeight:600}}>{p?.name}</span></span>;
                                })()}
                              </div>
                            </div>
                            <div style={{width:24,height:24,backgroundColor:C(0.4),WebkitMaskImage:"url(/icons/down.svg)",maskImage:"url(/icons/down.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center",transition:"transform 0.2s",transform:open?"rotate(180deg)":"none"}}/>
                          </div>
                          {open&&(
                            <div onClick={e=>e.stopPropagation()} style={{marginTop:6,paddingTop:8}}>
                              {people.length>1&&(
                              <>
                              <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:10}}>
                                <button onClick={()=>{const upd={personIds:people.map(p=>p.id),personId:people[0]?.id??null};setTasks(ts=>ts.map(x=>x.id!==t.id?x:{...x,...upd}));persistTask(t.id,upd);}} style={{
                                  display:"flex",alignItems:"center",height:34,boxSizing:"border-box",
                                  background:(t.personIds||[t.personId]).filter(Boolean).length===people.length?S(0.15):S(0.05),
                                  border:`2px solid ${(t.personIds||[t.personId]).filter(Boolean).length===people.length?C(0.4):C(0.08)}`,
                                  borderRadius:20,padding:"0 14px",cursor:"pointer",
                                }}>
                                  <span style={{color:(t.personIds||[t.personId]).filter(Boolean).length===people.length?C(0.9):C(0.4),fontSize:12,fontWeight:500}}>{tr("all")}</span>
                                </button>
                                {people.map(p=>{
                                  const pIds=t.personIds||[t.personId].filter(Boolean);
                                  const sel=pIds.length===1&&pIds.includes(p.id);
                                  return <button key={p.id} onClick={()=>{const upd={personIds:[p.id],personId:p.id};setTasks(ts=>ts.map(x=>x.id!==t.id?x:{...x,...upd}));persistTask(t.id,upd);}} style={{display:"flex",alignItems:"center",gap:7,height:34,boxSizing:"border-box",background:sel?p.color+"28":S(0.05),border:`2px solid ${sel?p.color+"90":C(0.08)}`,borderRadius:20,padding:"0 12px 0 6px",cursor:"pointer",position:"relative"}}>
                                    <Avatar person={p} size={20}/>
                                    <span style={{color:sel?p.color:C(0.45),fontSize:12,fontWeight:500}}>{p.name}</span>
                                  </button>;
                                })}
                              </div>
                              </>
                              )}
                              <div style={{display:"flex",gap:8}}>
                                {(!t.createdBy||t.createdBy===meId||(t.personIds||[t.personId]).includes(meId))&&<button onClick={()=>{if(!window.confirm(`Delete "${t.text}"? This can't be undone.`))return;setTasks(ts=>ts.map(x=>x.id!==t.id?x:{...x,archivedAt:new Date().toISOString()}));deleteTaskRemote(t.id);setExpandId(null);}} style={{flex:1,background:"rgba(248,113,113,0.1)",border:"none",borderRadius:12,padding:"9px",color:"#f87171",fontSize:12,fontWeight:600,cursor:"pointer"}}>Delete</button>}
                                <button onClick={()=>{setTaskNameError(false);setEditTaskId(t.id);setForm({zone:t.zone,text:t.text,freq:t.freq,personIds:t.personIds||[t.personId].filter(Boolean),customDays:t.customDays||4,startDate:t.scheduledDates?.[0]||todayStr,maxLen:32,timesPerDay:t.timesPerDay||1,estMinutes:t.estMinutes??null});setCustomTimeOpen(!![null,5,10,15,30,45,60].includes(t.estMinutes??null)?false:true);setExpandId(null);setTaskFormVisible(false);setTaskFormOpen(true);}} style={{flex:1,background:S(0.06),border:"none",borderRadius:12,padding:"9px",color:C(0.55),fontSize:12,fontWeight:600,cursor:"pointer"}}>Edit</button>
                              </div>
                              {t.createdBy&&t.createdBy!==meId&&!(t.personIds||[t.personId]).includes(meId)&&(()=>{const owner=getPerson(t.createdBy);return owner?<div style={{color:C(0.28),fontSize:11,marginTop:6,textAlign:"center"}}>Created by {owner.name}</div>:null;})()}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                );})}
              </div>
            </div>
          )}

          {/* ══ SETTINGS ══════════════════════════════════════════ */}
          {tab==="settings"&&(
            <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
              <div style={{flexShrink:0,padding:"16px 16px 16px",display:"flex",alignItems:"center",gap:10}}>
                {settingsView==="account"&&(
                  <button onClick={()=>{setSettingsView("main");setTimeout(()=>{if(settingsScrollRef.current)settingsScrollRef.current.scrollTop=settingsMainScrollPos.current;},0);}} style={{background:"none",border:"none",cursor:"pointer",padding:0,display:"flex",alignItems:"center"}}><div style={{width:24,height:24,backgroundColor:ACCENT,WebkitMaskImage:"url(/icons/left.svg)",maskImage:"url(/icons/left.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center"}}/></button>
                )}
                <span style={{color:C(0.88),fontFamily:"'SF Pro Display',-apple-system,sans-serif",fontSize:28,lineHeight:"34px",fontWeight:700}}>{settingsView==="account"?"Account":tr("header_settings")}</span>
              </div>
              <div ref={settingsScrollRef} style={{flex:1,overflowY:"auto",padding:"8px 16px 110px"}}>
              {settingsView==="main"&&(<>
              {myStreak>0&&(
                <div style={{marginBottom:22,display:"flex",alignItems:"center",gap:12}}>
                  <span style={{fontSize:28}}>🔥</span>
                  <div>
                    <div style={{color:"#fbbf24",fontSize:16,fontWeight:700}}>{myStreak}-day streak!</div>
                    <div style={{color:C(0.35),fontSize:12,marginTop:2}}>Keep it up, {me?.name}!</div>
                  </div>
                </div>
              )}
              {/* People */}
              <div>
                <div style={{marginBottom:12}}>
                  <span style={{color:C(0.85),fontSize:16,fontWeight:700}}>{tr("people")}</span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {people.map(p=>{
                    const count=tasks.filter(t=>t.personId===p.id).length;
                    return (
                      <div key={p.id} onClick={()=>{if(p.id!==meId)return;setPersonNameError(false);setPForm({name:p.name,color:p.color,avatarEmoji:p.avatarEmoji||""});setAvatarPicker(false);setPersonModal({mode:"edit",id:p.id});}} style={{...CARD,display:"flex",alignItems:"center",gap:10,cursor:p.id===meId?"pointer":"default"}}>
                        <Avatar person={p} size={40}/>
                        <div style={{flex:1}}>
                          <div style={{color:C(0.88),fontSize:15,fontWeight:600,display:"flex",alignItems:"center",gap:7}}>
                            {p.name}
                            {meId===p.id&&<span style={{fontSize:11,color:ACCENT,background:"rgba(129,140,248,0.15)",border:"1px solid rgba(129,140,248,0.3)",borderRadius:6,padding:"3px 6px"}}>me</span>}
                          </div>
                          <div style={{color:C(0.55),fontSize:12,marginTop:1}}>{count} task{count!==1?"s":""}</div>
                        </div>
                        {p.id===meId&&<div style={{width:24,height:24,backgroundColor:C(0.2),WebkitMaskImage:"url(/icons/right.svg)",maskImage:"url(/icons/right.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center"}}/>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Preferences */}
              <div style={{marginTop:24,marginBottom:24}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                  <span style={{color:C(0.85),fontSize:16,fontWeight:700}}>{tr("theme")}</span>
                  <button onClick={()=>setThemePersisted(theme==="dark"?"light":"dark")} style={{position:"relative",width:56,height:32,borderRadius:16,border:"none",background:S(0.1),cursor:"pointer",flexShrink:0,padding:0}}>
                    <div style={{position:"absolute",top:3,left:theme==="dark"?3:27,width:26,height:26,borderRadius:"50%",background:theme==="dark"?"#3730a3":"#fbbf24",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,transition:"left 0.2s"}}>
                      <div style={{width:16,height:16,backgroundColor:"#fff",WebkitMaskImage:`url(/icons/${theme==="dark"?"moon":"sun"}-fill.svg)`,maskImage:`url(/icons/${theme==="dark"?"moon":"sun"}-fill.svg)`,WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center"}}/>
                    </div>
                  </button>
                </div>
                <div style={{color:C(0.85),fontSize:16,fontWeight:700,marginBottom:6}}>Day starts at</div>
                <div style={{color:C(0.4),fontSize:11,marginBottom:10}}>Applies to everyone in this home — late-night tasks still count toward the previous day</div>
                <div style={{display:"flex",gap:8}}>
                  {[{h:0,label:"Midnight"},{h:3,label:"3 AM"},{h:5,label:"5 AM"}].map(opt=>(
                    <button key={opt.h} onClick={()=>{
                      const computeEffectiveTodayStr=resetHour=>{
                        const now=new Date();
                        if(resetHour>0&&now.getHours()<resetHour) now.setDate(now.getDate()-1);
                        now.setHours(0,0,0,0);
                        return ds(now);
                      };
                      const oldTodayStr=computeEffectiveTodayStr(dayResetHour);
                      const newTodayStr=computeEffectiveTodayStr(opt.h);
                      setDayResetHour(opt.h);
                      supabase.from("households").update({day_reset_hour:opt.h}).eq("id",household.id).then(({error})=>{
                        if(error){ console.error("setDayResetHour",error); window.alert("Couldn't save this setting: "+error.message); }
                      });
                      // If "today" just shifted backward (there's now more time
                      // left to finish what was due on that day), un-move any
                      // tasks that got auto-moved forward off of that day —
                      // they still have time, no need to have bumped them.
                      if(newTodayStr<oldTodayStr){
                        const affected=tasks.filter(t=>t.rescheduledFrom===newTodayStr);
                        affected.forEach(t=>{
                          const dates=[...new Set([...t.scheduledDates.filter(d=>d!==oldTodayStr),newTodayStr])].sort();
                          const excludedDates=(t.excludedDates||[]).filter(d=>d!==newTodayStr);
                          const shiftAnchor=(t.freq&&t.freq!=="once")?newTodayStr:t.shiftAnchor;
                          const newFields={scheduledDates:dates,excludedDates,shiftAnchor,rescheduledFrom:null};
                          setTasks(ts=>ts.map(x=>x.id!==t.id?x:{...x,...newFields}));
                          persistTask(t.id,newFields);
                        });
                        if(affected.length>0){
                          setToast({icon:"↩️",from:`${affected.length} task${affected.length!==1?"s":""} moved back`,text:"There's still time to finish them today"});
                          setTimeout(()=>setToast(null),4000);
                        }
                      }
                    }} style={{flex:1,height:34,boxSizing:"border-box",background:dayResetHour===opt.h?"rgba(129,140,248,0.28)":S(0.06),border:`1.5px solid ${dayResetHour===opt.h?ACCENT:"transparent"}`,borderRadius:12,color:dayResetHour===opt.h?"#fff":C(0.4),fontSize:13,fontWeight:dayResetHour===opt.h?700:500,cursor:"pointer"}}>{opt.label}</button>
                  ))}
                </div>
              </div>

              {/* Account entry point */}
              <div onClick={()=>{if(settingsScrollRef.current)settingsMainScrollPos.current=settingsScrollRef.current.scrollTop;setSettingsView("account");}} style={{...CARD,display:"flex",alignItems:"center",gap:10,cursor:"pointer",minHeight:44}}>
                <div style={{width:40,height:40,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>👤</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:C(0.82),fontSize:14,fontWeight:500}}>Account</div>
                  <div style={{color:C(0.4),fontSize:11,marginTop:1}}>Invite code, sign out, delete account</div>
                </div>
                <div style={{width:24,height:24,backgroundColor:C(0.2),WebkitMaskImage:"url(/icons/right.svg)",maskImage:"url(/icons/right.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center"}}/>
              </div>
              </>)}

              {settingsView==="account"&&(
              <div>
                {email&&<div style={{color:C(0.3),fontSize:12,marginBottom:20}}>{tr("signed_in_as")} {email}</div>}

                <div style={{color:C(0.85),fontSize:16,fontWeight:700,marginBottom:12}}>{tr("invite_code")}</div>
                <div style={{...CARD,display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <span style={{color:C(0.85),fontSize:18,fontWeight:700,letterSpacing:2}}>{household.invite_code}</span>
                  <button onClick={()=>{navigator.clipboard?.writeText(household.invite_code);setCodeCopied(true);setTimeout(()=>setCodeCopied(false),1800);}} style={{background:"none",border:"none",width:38,height:38,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>
                    {codeCopied?(
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 12l6 6L20 6" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    ):(
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="12" height="12" rx="2" stroke={ACCENT} strokeWidth="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10" stroke={ACCENT} strokeWidth="2" strokeLinecap="round"/></svg>
                    )}
                  </button>
                </div>
                <div style={{color:C(0.3),fontSize:11,marginBottom:20}}>{tr("share_code")}</div>
                <div style={{...CARD,marginBottom:14}}>
                  <div style={{color:C(0.85),fontSize:14,fontWeight:700,marginBottom:4}}>Set a password</div>
                  <div style={{color:C(0.4),fontSize:12,marginBottom:10}}>Optional — lets you sign in faster next time, without waiting for an email code.</div>
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder="New password"
                    value={newPassword}
                    onChange={e=>{setNewPassword(e.target.value);setPasswordMsg("");}}
                    className="std-input" style={{...inputSt,marginBottom:8}}
                  />
                  {passwordMsg&&<div style={{color:passwordMsg.startsWith("✓")?"#34d399":"#f87171",fontSize:12,marginBottom:8}}>{passwordMsg}</div>}
                  <button onClick={async()=>{
                    if(newPassword.length<6){setPasswordMsg("Password must be at least 6 characters");return;}
                    setSettingPassword(true);
                    const {error}=await supabase.auth.updateUser({password:newPassword});
                    setSettingPassword(false);
                    if(error){ setPasswordMsg(error.message||"Couldn't set password"); return; }
                    setPasswordMsg("✓ Password set");
                    setNewPassword("");
                  }} disabled={settingPassword} style={{background:`linear-gradient(135deg,${ACCENT},${ACCENT2})`,border:"none",borderRadius:12,height:50,boxSizing:"border-box",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:16,lineHeight:"18px",fontWeight:600,cursor:"pointer",width:"100%",opacity:settingPassword?0.6:1}}>{settingPassword?"Saving…":"Set password"}</button>
                </div>
                <button onClick={onSignOut} style={{background:"rgba(248,113,113,0.08)",border:"1px solid rgba(248,113,113,0.25)",borderRadius:14,padding:"13px",color:"#f87171",fontSize:14,fontWeight:700,cursor:"pointer",width:"100%",marginBottom:14}}>{tr("sign_out")}</button>
                <button onClick={async()=>{
                  if(!window.confirm("Permanently delete your account and login? This removes your profile from this home and cannot be undone.")) return;
                  const personDeleted=await deletePersonRemote(meId);
                  const {data:{session}}=await supabase.auth.getSession();
                  let authDeleted=false;
                  if(session?.access_token){
                    try{
                      const res=await fetch("/api/delete-account",{
                        method:"POST",
                        headers:{"Content-Type":"application/json"},
                        body:JSON.stringify({access_token:session.access_token}),
                      });
                      authDeleted=res.ok;
                      if(!res.ok) console.error("delete-account failed",await res.text());
                    }catch(e){ console.error("delete-account request failed",e); }
                  }
                  if(!personDeleted||!authDeleted){
                    window.alert("Something went wrong deleting your account fully. You've been signed out, but please try again or contact support.");
                  }
                  onSignOut();
                }} style={{background:"none",border:"none",color:"rgba(248,113,113,0.4)",fontSize:12,cursor:"pointer",padding:"4px 0",display:"block",width:"100%",textAlign:"center"}}>{tr("delete_account")}</button>
              </div>
              )}
              </div>
            </div>
          )}

        </div>{/* end body */}

        {/* ── TAB BAR ───────────────────────────────────────────── */}
        <div style={{position:"absolute",left:8,right:8,bottom:24,zIndex:100,display:"flex",alignItems:"center",gap:8}}>
          <div key={theme} ref={tabBarMeasureRef} style={{flex:1,height:64,boxSizing:"border-box",position:"relative",background:isDark?"rgba(78,82,135,0.5)":"rgba(255,255,255,0.6)",backdropFilter:"blur(24px) saturate(120%)",WebkitBackdropFilter:"blur(24px) saturate(120%)",border:isDark?"1px solid #494D68":"1px solid rgba(255,255,255,1)",borderRadius:32,padding:0,boxSizing:"border-box",display:"flex",alignItems:"center",justifyContent:"center",gap:0}}>
            {(()=>{
              const nonAccentTabs=TABS.filter(t=>!t.accent);
              const n=nonAccentTabs.length;
              const activeIdx=nonAccentTabs.findIndex(t=>t.id===tab);
              if(activeIdx<0||taskFormOpen||tabBarWidth<=0) return null;
              const edge=2; // fixed 2px margin from the bar's own measured edge, explicit, no CSS inset involved
              const trackWidth=tabBarWidth-edge*2;
              const slotWidth=trackWidth/n;
              const boundaries=Array.from({length:n+1},(_,i)=>{
                if(i===0) return edge;
                if(i===n) return tabBarWidth-edge; // force exact right edge, no rounding drift
                return edge+Math.round(i*slotWidth);
              });
              const left=boundaries[activeIdx];
              const right=tabBarWidth-boundaries[activeIdx+1];
              return (
                <div style={{position:"absolute",top:edge,bottom:edge,left,right,boxSizing:"border-box",borderRadius:40,background:"rgba(129,140,248,0.28)",border:`1.5px solid ${ACCENT}`,transition:"left 0.3s cubic-bezier(0.34,1.2,0.64,1), right 0.3s cubic-bezier(0.34,1.2,0.64,1)",pointerEvents:"none"}}/>
              );
            })()}
            {TABS.filter(item=>!item.accent).map(item=>{
              const active=tab===item.id&&!taskFormOpen;
              const pressed=pressedTab===item.id;
              return (
                <button key={item.id}
                  onTouchStart={e=>{e.preventDefault();pressStart("tab",setPressedTab,item.id);}}
                  onTouchEnd={e=>{e.preventDefault();setTaskFormOpen(false);setTab(item.id);pressEnd("tab",setPressedTab,null);}}
                  onTouchCancel={()=>pressEnd("tab",setPressedTab,null)}
                  onMouseDown={()=>pressStart("tab",setPressedTab,item.id)}
                  onMouseUp={()=>{setTaskFormOpen(false);setTab(item.id);pressEnd("tab",setPressedTab,null);}}
                  onMouseLeave={()=>pressEnd("tab",setPressedTab,null)}
                  style={{position:"relative",flex:1,height:60,border:"none",padding:4,boxSizing:"border-box",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",background:"transparent"}}>
                  <div style={{position:"relative",display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                    <div style={{width:28,height:28,backgroundColor:active?"#fff":"#868C93",WebkitMaskImage:`url(/icons/${item.icon}-${active?"fill":"outline"}.svg)`,maskImage:`url(/icons/${item.icon}-${active?"fill":"outline"}.svg)`,WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center",transform:pressed?"scale(1.22)":"scale(1)",transition:pressed?"transform 0.1s ease-out, background-color 0.2s":"transform 0.4s cubic-bezier(0.34,1.56,0.64,1), background-color 0.2s"}}/>
                    <span style={{fontFamily:"'SF Compact Text',-apple-system,sans-serif",fontSize:10,lineHeight:"12px",fontWeight:400,letterSpacing:0.2,color:active?"#fff":"#868C93",whiteSpace:"nowrap"}}>{item.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
          <button
            onTouchStart={e=>{e.preventDefault();pressStart("plus",setPressedPlus,true);}} onTouchEnd={e=>{e.preventDefault();setTaskNameError(false);setAssigneeError(false);setEditTaskId(null);setForm(blankForm);setCustomTimeOpen(false);setTaskFormVisible(false);setTaskFormOpen(true);pressEnd("plus",setPressedPlus,false);}} onTouchCancel={()=>pressEnd("plus",setPressedPlus,false)}
            onMouseDown={()=>pressStart("plus",setPressedPlus,true)} onMouseUp={()=>{setTaskNameError(false);setAssigneeError(false);setEditTaskId(null);setForm(blankForm);setCustomTimeOpen(false);setTaskFormVisible(false);setTaskFormOpen(true);pressEnd("plus",setPressedPlus,false);}} onMouseLeave={()=>pressEnd("plus",setPressedPlus,false)}
            style={{flex:"0 1 52px",minWidth:36,aspectRatio:"1",height:"auto",maxHeight:52,borderRadius:"50%",border:"none",background:"linear-gradient(135deg,#5EF9B0,#6388FF,#7B61FF)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transform:pressedPlus?"scale(1.22)":"scale(1)",transition:pressedPlus?"transform 0.1s ease-out":"transform 0.4s cubic-bezier(0.34,1.56,0.64,1)"}}>
            <div style={{width:22,height:22,backgroundColor:isDark?"#343249":"#fff",WebkitMaskImage:"url(/icons/plus-outline.svg)",maskImage:"url(/icons/plus-outline.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center"}}/>
          </button>
        </div>

        {/* ── STATS MODAL ───────────────────────────────────────── */}

        {showStats&&(
          <div style={{position:"absolute",inset:0,zIndex:300,background:THEME_COLORS[theme].bg,display:"flex",flexDirection:"column",transform:`translateX(${statsVisible?0:100}%)`,transition:"transform 0.32s cubic-bezier(0.32,0.72,0,1)"}}>
              {/* Header with back button */}
              <div style={{flexShrink:0,padding:"16px 16px 16px",display:"flex",alignItems:"center",gap:8}}>
                <button
                  onTouchStart={e=>{e.preventDefault();pressStart("stats-back",setPressedStatsBack,true);}} onTouchEnd={e=>{e.preventDefault();closeStats();pressEnd("stats-back",setPressedStatsBack,false);}} onTouchCancel={()=>pressEnd("stats-back",setPressedStatsBack,false)}
                  onMouseDown={()=>pressStart("stats-back",setPressedStatsBack,true)} onMouseUp={()=>{closeStats();pressEnd("stats-back",setPressedStatsBack,false);}} onMouseLeave={()=>pressEnd("stats-back",setPressedStatsBack,false)}
                  style={{background:"none",border:"none",width:36,height:36,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,flexShrink:0}}>
                  <div style={{width:24,height:24,backgroundColor:TEXT2,WebkitMaskImage:"url(/icons/left.svg)",maskImage:"url(/icons/left.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center",transform:pressedStatsBack?"scale(1.4)":"scale(1)",transition:pressedStatsBack?"transform 0.1s ease-out":"transform 0.4s cubic-bezier(0.34,1.56,0.64,1)"}}/>
                </button>
                <div style={{color:C(0.9),fontFamily:"'SF Pro Display',-apple-system,sans-serif",fontSize:20,lineHeight:"24px",fontWeight:700}}>Stats</div>
              </div>
              {/* Scrollable content */}
              <div style={{flex:1,overflowY:"auto",padding:"0 16px 110px"}}>
              {(()=>{
                const weekDates=Array.from({length:7},(_,i)=>{const d=new Date(TODAY);d.setDate(TODAY.getDate()-((TODAY.getDay()+6)%7)+i);return ds(d);});
                const lastWeekDates=Array.from({length:7},(_,i)=>{const d=new Date(TODAY);d.setDate(TODAY.getDate()-((TODAY.getDay()+6)%7)-7+i);return ds(d);});
                const mvp=getWeeklyMVP(tasks,people,weekDates);
                const dreamTeam=getDreamTeam(tasks,people,weekDates);
                const DIV=<div style={{height:SPACE_SM}}/>;
                const SL=t=><div style={{color:"rgba(255,255,255,0.85)",fontSize:16,fontWeight:700,marginBottom:12}}>{t}</div>;
                return(<>

                  {/* Weekly summary */}
                  <div style={{...CARD,marginBottom:12}}>
                    {SL("This week")}
                    {mvp&&<div style={{background:"rgba(251,191,36,0.12)",borderRadius:14,padding:"9px 15px",marginBottom:20,display:"flex",alignItems:"center",gap:8,border:"1px solid rgba(251,191,36,0.3)"}}>
                      <span style={{fontSize:20}}>⭐</span>
                      <span style={{color:"#fbbf24",fontSize:13,fontWeight:500}}>Top performer this week: {mvp.name}</span>
                    </div>}
                    {dreamTeam&&<div style={{background:"rgba(52,211,153,0.12)",borderRadius:14,padding:"9px 15px",marginBottom:20,display:"flex",alignItems:"center",gap:8,border:"1px solid rgba(52,211,153,0.3)"}}>
                      <span style={{fontSize:20}}>🤝</span>
                      <span style={{color:"#34d399",fontSize:13,fontWeight:500}}>Dream Team — everyone contributed!</span>
                    </div>}
                    <div style={{color:C(0.4),fontSize:11,marginBottom:10}}>Share of this week's household tasks each person has personally completed</div>
                    {[...people].sort((a,b)=>getWeekStats(tasks,b.id,weekDates).pct-getWeekStats(tasks,a.id,weekDates).pct).map((p,i,arr)=>{
                      const ws=getWeekStats(tasks,p.id,weekDates);
                      const rank=getRank(computePts(tasks,p.id));
                      return(
                        <div key={p.id} style={{marginBottom:i<arr.length-1?14:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                            <Avatar person={p} size={32}/>
                            <div style={{flex:1}}>
                              <div style={{color:"rgba(255,255,255,0.88)",fontSize:14,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
                                {p.name}
                                {meId===p.id&&<span style={{fontSize:11,color:ACCENT,background:"rgba(129,140,248,0.15)",borderRadius:4,padding:"2px 5px"}}>me</span>}
                              </div>
                              <div style={{color:rank.color,fontSize:11}}>{rank.label}</div>
                            </div>
                            <div style={{textAlign:"right"}}>
                              <div style={{color:"rgba(255,255,255,0.88)",fontSize:15,fontWeight:700}}>{ws.done} <span style={{color:"rgba(255,255,255,0.4)",fontSize:11,fontWeight:500}}>of {ws.total} household tasks</span></div>
                              <div style={{color:ws.pct>=80?"#34d399":ws.pct>=50?"#fbbf24":"#f87171",fontSize:11,fontWeight:600}}>{ws.pct}% done this week</div>
                            </div>
                          </div>
                          <div style={{background:"rgba(255,255,255,0.07)",borderRadius:4,height:4,overflow:"hidden"}}>
                            <div style={{height:"100%",width:`${ws.pct}%`,borderRadius:4,transition:"width 0.4s",background:ws.pct>=80?"linear-gradient(90deg,#34d399,#6ee7b7)":ws.pct>=50?"linear-gradient(90deg,#fbbf24,#fde68a)":"linear-gradient(90deg,#f87171,#fca5a5)"}}/>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {DIV}
                  {/* Leaderboard */}
                  <div style={{...CARD,marginBottom:12}}>
                    {SL("Leaderboard")}
                    {(()=>{
                      const ranked=[...people].sort((a,b)=>computePts(tasks,b.id)-computePts(tasks,a.id));
                      const maxPts=Math.max(1,...ranked.map(p=>computePts(tasks,p.id)));
                      return ranked.map((p,i)=>{
                        const pts=computePts(tasks,p.id);
                        const rank=getRank(pts);
                        const pct=Math.max(6,Math.round(pts/maxPts*100));
                        const medal=["🥇","🥈","🥉"][i];
                        return(
                          <div key={p.id} style={{marginBottom:i<ranked.length-1?16:0}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                              {medal?<span style={{fontSize:20,width:26,textAlign:"center",flexShrink:0}}>{medal}</span>:<span style={{fontSize:13,width:26,textAlign:"center",flexShrink:0,color:"rgba(255,255,255,0.3)",fontWeight:700}}>{i+1}</span>}
                              <Avatar person={p} size={28}/>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{color:"rgba(255,255,255,0.88)",fontSize:14,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
                                  {p.name}
                                  {meId===p.id&&<span style={{fontSize:11,color:ACCENT,background:"rgba(129,140,248,0.15)",borderRadius:4,padding:"2px 5px"}}>me</span>}
                                </div>
                                <div style={{color:rank.color,fontSize:11}}>{rank.icon} {rank.label}</div>
                              </div>
                              <div style={{color:"#fff",fontSize:16,fontWeight:700,flexShrink:0}}>{pts}<span style={{color:"rgba(255,255,255,0.3)",fontSize:11}}> pts</span></div>
                            </div>
                            <div style={{height:8,borderRadius:4,background:"rgba(255,255,255,0.08)",overflow:"hidden",marginLeft:34}}>
                              <div style={{height:"100%",width:`${pct}%`,borderRadius:4,background:i===0?"linear-gradient(90deg,#fbbf24,#fde68a)":`linear-gradient(90deg,${ACCENT},${ACCENT2})`,transition:"width 0.5s ease"}}/>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                  {DIV}
                  {/* Streak milestones */}
                  <div style={{...CARD,marginBottom:12}}>
                    {SL("Streaks")}
                    {people.map(p=>{
                      const pStreak=(()=>{let s=0;for(let i=1;i<=90;i++){const d=new Date(TODAY);d.setDate(TODAY.getDate()-i);const dStr=ds(d);const myT=tasks.filter(t=>(t.personIds||[t.personId]).includes(p.id)&&isScheduledOn(t,dStr));if(myT.length===0)continue;if(myT.every(t=>doneOnDateBy(t.doneOn,dStr,p.id)))s++;else break;}return s;})();
                      return {p,pStreak};
                    }).sort((a,b)=>b.pStreak-a.pStreak).map(({p,pStreak},pi)=>{
                      const earned=getStreakMilestones(pStreak);
                      const next=STREAK_MILESTONES.find(m=>pStreak<m.days);
                      return(
                        <div key={p.id} style={{marginBottom:pi<people.length-1?24:0}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              <Avatar person={p} size={32}/>
                              <span style={{color:"rgba(255,255,255,0.85)",fontSize:14,fontWeight:600}}>{p.name}</span>
                              {meId===p.id&&<span style={{fontSize:11,color:ACCENT,background:"rgba(129,140,248,0.15)",borderRadius:4,padding:"2px 5px"}}>me</span>}
                            </div>
                            <span style={{color:pStreak>0?"#fbbf24":"rgba(255,255,255,0.3)",fontSize:14,fontWeight:700}}>
                              {pStreak>0?`🔥 ${pStreak} days`:"No streak yet"}
                            </span>
                          </div>
                          {earned.length>0&&(
                            <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:6}}>
                              {earned.map(m=>(
                                <span key={m.days} style={{
                                  display:"inline-flex",alignItems:"center",
                                  color:"rgba(255,255,255,0.75)",
                                  background:"rgba(255,255,255,0.08)",
                                  border:`1px solid rgba(255,255,255,0.12)`,
                                  borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:500,lineHeight:1,
                                }}>{m.icon} {m.label}</span>
                              ))}
                            </div>
                          )}
                          {next?(
                            <div style={{color:C(0.5),fontSize:12,marginTop:1}}>
                              {next.days-pStreak} more days to unlock {next.label}
                            </div>
                          ):(
                            <div style={{color:"#e879f9",fontSize:12,marginTop:1}}>All streak badges unlocked!</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {DIV}
                  {/* Zone achievements */}
                  <div style={{...CARD,marginBottom:12}}>
                    {SL("Zone achievements")}
                    {[...people].sort((a,b)=>getZoneAch(tasks,b.id).length-getZoneAch(tasks,a.id).length).map((p,pi,arr)=>{
                      const achs=getZoneAch(tasks,p.id);
                      const LEVELS=[{icon:"🥉",min:10,color:"#fb923c"},{icon:"🥈",min:50,color:"#94a3b8"},{icon:"🥇",min:100,color:"#fbbf24"}];
                      return(
                        <div key={p.id} style={{marginBottom:pi<arr.length-1?20:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                            <Avatar person={p} size={32}/>
                            <span style={{color:"rgba(255,255,255,0.7)",fontSize:13,fontWeight:600}}>{p.name}</span>
                            {meId===p.id&&<span style={{fontSize:11,color:ACCENT,background:"rgba(129,140,248,0.15)",borderRadius:4,padding:"2px 5px"}}>me</span>}
                          </div>
                          {achs.length===0
                            ?<div style={{color:"rgba(255,255,255,0.3)",fontSize:12}}>Complete 10 tasks in any zone to unlock Bronze</div>
                            :<div style={{display:"flex",flexDirection:"column",gap:8}}>
                              {achs.map(a=>(
                                <div key={a.zone} style={{
                                  background:"rgba(255,255,255,0.05)",
                                  border:`1px solid rgba(255,255,255,0.08)`,
                                  borderRadius:12,padding:"12px 12px",
                                }}>
                                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:7}}>
                                    <span style={{color:"rgba(255,255,255,0.8)",fontSize:13,fontWeight:500}}>{a.label}</span>
                                    <div style={{display:"flex",alignItems:"center",gap:3}}>
                                      {LEVELS.map(lvl=>(
                                        <span key={lvl.min} style={{fontSize:15,opacity:a.ach.cnt>=lvl.min?1:0.2,filter:a.ach.cnt>=lvl.min?"none":"grayscale(1)"}}>{lvl.icon}</span>
                                      ))}
                                    </div>
                                  </div>
                                  {(()=>{
                                    const floor=a.ach.cnt>=100?100:a.ach.cnt>=50?50:a.ach.cnt>=10?10:0;
                                    const ceil=a.ach.cnt>=100?100:a.ach.cnt>=50?100:a.ach.cnt>=10?50:10;
                                    const pct=a.ach.cnt>=100?100:Math.round((a.ach.cnt-floor)/(ceil-floor)*100);
                                    return(
                                      <div style={{background:"rgba(255,255,255,0.07)",borderRadius:3,height:4,overflow:"hidden"}}>
                                        <div style={{height:"100%",width:`${pct}%`,borderRadius:3,background:a.ach.color}}/>
                                      </div>
                                    );
                                  })()}
                                </div>
                              ))}
                            </div>
                          }
                        </div>
                      );
                    })}
                  </div>

                  {DIV}
                  {/* Busiest zones */}
                  <div style={{...CARD,marginBottom:12}}>
                    {SL("Busiest zones")}
                    {(()=>{
                      const ZONE_RING_COLORS=[ACCENT,"#f472b6","#34d399","#fbbf24","#38bdf8","#fb923c","#a78bfa","#2dd4bf"];
                      const counts=zones.map((z,i)=>({z,count:tasks.filter(t=>t.zone===z.id).length,color:ZONE_RING_COLORS[i%ZONE_RING_COLORS.length]})).filter(x=>x.count>0);
                      const total=counts.reduce((s,x)=>s+x.count,0);
                      if(total===0) return <div style={{color:C(0.4),fontSize:12}}>No tasks yet to break down by zone</div>;
                      const R=54,CIRC=2*Math.PI*R;
                      let cumOffset=0;
                      const arcs=counts.map(x=>{
                        const frac=x.count/total;
                        const dash=frac*CIRC;
                        const arc={...x,frac,dashOffset:-cumOffset};
                        cumOffset+=dash;
                        return arc;
                      });
                      return (
                        <div style={{display:"flex",alignItems:"center",gap:20}}>
                          <svg width="132" height="132" viewBox="0 0 132 132" style={{flexShrink:0,transform:"rotate(-90deg)"}}>
                            <circle cx="66" cy="66" r={R} fill="none" stroke={C(0.06)} strokeWidth="16"/>
                            {arcs.map(a=>(
                              <circle key={a.z.id} cx="66" cy="66" r={R} fill="none" stroke={a.color} strokeWidth="16"
                                strokeDasharray={`${a.frac*CIRC} ${CIRC}`} strokeDashoffset={a.dashOffset} strokeLinecap="butt"/>
                            ))}
                          </svg>
                          <div style={{flex:1,display:"flex",flexDirection:"column",gap:8,minWidth:0}}>
                            {arcs.sort((a,b)=>b.count-a.count).map(a=>(
                              <div key={a.z.id} style={{display:"flex",alignItems:"center",gap:8}}>
                                <div style={{width:10,height:10,borderRadius:"50%",background:a.color,flexShrink:0}}/>
                                <span style={{color:C(0.7),fontSize:13,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.z.emoji} {a.z.label}</span>
                                <span style={{color:C(0.9),fontSize:13,fontWeight:700,flexShrink:0}}>{Math.round(a.frac*100)}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {DIV}
                  {/* Week over week */}
                  <div style={{...CARD,marginBottom:12}}>
                    {SL("This week vs last week")}
                    {(()=>{
                      const thisW=totalCompletionsOn(tasks,weekDates);
                      const lastW=totalCompletionsOn(tasks,lastWeekDates);
                      const diff=thisW-lastW;
                      const up=diff>0,flat=diff===0;
                      return (
                        <div style={{display:"flex",alignItems:"center",gap:16}}>
                          <div style={{textAlign:"center"}}>
                            <div style={{color:C(0.4),fontSize:11}}>Last week</div>
                            <div style={{color:C(0.6),fontSize:22,fontWeight:700}}>{lastW}</div>
                          </div>
                          <div style={{width:24,height:24,backgroundColor:C(0.2),WebkitMaskImage:"url(/icons/right.svg)",maskImage:"url(/icons/right.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center"}}/>
                          <div style={{textAlign:"center"}}>
                            <div style={{color:C(0.4),fontSize:11}}>This week</div>
                            <div style={{color:"#fff",fontSize:22,fontWeight:700}}>{thisW}</div>
                          </div>
                          <div style={{flex:1,textAlign:"right",color:flat?C(0.4):up?"#34d399":"#f87171",fontSize:14,fontWeight:700}}>
                            {flat?"No change":up?`▲ +${diff}`:`▼ ${diff}`}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {DIV}
                  {/* Day of week pattern */}
                  <div style={{...CARD,marginBottom:12}}>
                    {SL("Best & toughest days")}
                    {(()=>{
                      const dayLabels=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
                      const stats=dayLabels.map((label,dow)=>{
                        let done=0,total=0;
                        for(let i=0;i<84;i++){
                          const d=new Date(TODAY); d.setDate(TODAY.getDate()-i);
                          if((d.getDay()+6)%7!==dow) continue;
                          const dStr=ds(d);
                          const dayAll=tasks.filter(t=>isScheduledOn(t,dStr));
                          total+=dayAll.length;
                          done+=dayAll.filter(t=>doneOnDate(t,dStr)).length;
                        }
                        return {label,pct:total===0?null:Math.round(done/total*100)};
                      });
                      const withData=stats.filter(s=>s.pct!==null);
                      if(withData.length===0) return <div style={{color:C(0.4),fontSize:12}}>Not enough history yet</div>;
                      const best=Math.max(...withData.map(s=>s.pct));
                      return (
                        <div style={{display:"flex",gap:6,alignItems:"flex-end",height:70}}>
                          {stats.map(s=>(
                            <div key={s.label} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                              <div style={{width:"100%",height:44,display:"flex",alignItems:"flex-end"}}>
                                <div style={{width:"100%",borderRadius:4,height:`${s.pct??0}%`,minHeight:s.pct?3:0,background:s.pct===best?"linear-gradient(180deg,#34d399,#6ee7b7)":"rgba(255,255,255,0.15)"}}/>
                              </div>
                              <span style={{color:C(0.4),fontSize:10}}>{s.label}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {DIV}
                  {/* Household streak + all-time total */}
                  <div style={{marginBottom:12,display:"flex",gap:12}}>
                    {(()=>{
                      const hStreak=getHouseholdStreak(tasks,ds,TODAY);
                      const allTime=tasks.reduce((s,t)=>s+(t.doneOn||[]).length,0);
                      return (<>
                        <div style={{flex:1,...CARD,textAlign:"center"}}>
                          <div style={{fontSize:22}}>{hStreak>0?"🔥":"💤"}</div>
                          <div style={{color:"#fff",fontSize:20,fontWeight:700,marginTop:2}}>{hStreak}</div>
                          <div style={{color:C(0.45),fontSize:11}}>day household streak</div>
                        </div>
                        <div style={{flex:1,...CARD,textAlign:"center"}}>
                          <div style={{width:22,height:22,margin:"0 auto",backgroundColor:"#fbbf24",WebkitMaskImage:"url(/icons/trophy-fill.svg)",maskImage:"url(/icons/trophy-fill.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center"}}/>
                          <div style={{color:"#fff",fontSize:20,fontWeight:700,marginTop:2}}>{allTime}</div>
                          <div style={{color:C(0.45),fontSize:11}}>tasks done, all time</div>
                        </div>
                      </>);
                    })()}
                  </div>

                  {DIV}
                  {/* Most-liked task */}
                  <div style={{...CARD,marginBottom:12}}>
                    {SL("Crowd favorite")}
                    {(()=>{
                      const ml=getMostLikedTask(tasks);
                      if(!ml) return <div style={{color:C(0.4),fontSize:12}}>No likes yet — go appreciate someone's work!</div>;
                      const z=getZone(ml.task.zone);
                      return (
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <div style={{width:26,height:26,backgroundColor:"#f87171",flexShrink:0,WebkitMaskImage:"url(/icons/heart-fill.svg)",maskImage:"url(/icons/heart-fill.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center"}}/>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{color:"#fff",fontSize:14,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ml.task.text}</div>
                            <div style={{color:C(0.4),fontSize:11}}>{z?.emoji} {z?.label}</div>
                          </div>
                          <div style={{color:"#f87171",fontSize:16,fontWeight:700,display:"flex",alignItems:"center",gap:4}}>{ml.count}<div style={{width:14,height:14,backgroundColor:"#f87171",WebkitMaskImage:"url(/icons/heart-fill.svg)",maskImage:"url(/icons/heart-fill.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center"}}/></div>
                        </div>
                      );
                    })()}
                  </div>

                  {DIV}
                  {/* Task creators */}
                  <div style={{...CARD,marginBottom:12}}>
                    {SL("Who plans the chores")}
                    {(()=>{
                      const counts=people.map(p=>({p,count:tasks.filter(t=>t.createdBy===p.id).length})).filter(x=>x.count>0).sort((a,b)=>b.count-a.count);
                      if(counts.length===0) return <div style={{color:C(0.4),fontSize:12}}>No task-creation history yet</div>;
                      return (
                        <div style={{display:"flex",flexDirection:"column",gap:8}}>
                          {counts.map(({p,count})=>(
                            <div key={p.id} style={{display:"flex",alignItems:"center",gap:8}}>
                              <Avatar person={p} size={26}/>
                              <span style={{color:C(0.75),fontSize:13,flex:1}}>{p.name}</span>
                              <span style={{color:C(0.9),fontSize:13,fontWeight:700}}>{count} created</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {DIV}
                  {/* On-time rate */}
                  <div style={{...CARD,marginBottom:12}}>
                    {SL("On-time vs rescheduled")}
                    {(()=>{
                      const otr=getOnTimeRate(tasks);
                      if(!otr) return <div style={{color:C(0.4),fontSize:12}}>Not enough history yet</div>;
                      return (
                        <div>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                            <span style={{color:C(0.6),fontSize:13}}>{otr.onTimePct}% completed without rescheduling</span>
                            <span style={{color:C(0.4),fontSize:12}}>{otr.rescheduled} of {otr.total} moved</span>
                          </div>
                          <div style={{background:"rgba(255,255,255,0.07)",borderRadius:4,height:6,overflow:"hidden"}}>
                            <div style={{height:"100%",width:`${otr.onTimePct}%`,borderRadius:4,background:otr.onTimePct>=80?"linear-gradient(90deg,#34d399,#6ee7b7)":otr.onTimePct>=50?"linear-gradient(90deg,#fbbf24,#fde68a)":"linear-gradient(90deg,#f87171,#fca5a5)"}}/>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                </>);
              })()}
              </div>
          </div>
        )}

        {/* ── ZONE EDIT/CREATE SHEET (global — reachable from any tab) ──── */}
        {zoneExpandId&&(()=>{
          const isNew=zoneExpandId==="__new__";
          const z=isNew?null:zones.find(x=>x.id===zoneExpandId);
          if(!isNew&&!z) return null;
          const closeZoneScreen=()=>{
            if(document.activeElement instanceof HTMLElement) document.activeElement.blur();
            setZoneExpandId(null);
            setEmojiPicker(false);
          };
          const submitZone=()=>{
            if(!zForm.label.trim()){setZoneNameError(true);return;}
            if(isNew){
              const nz={id:uid(),label:zForm.label.trim(),emoji:zForm.emoji};
              setZones(zs=>[...zs,nz]);
              insertZone(nz);
            } else {
              saveZone();
            }
            closeZoneScreen();
          };
          return(
          <div style={{position:"absolute",inset:0,zIndex:300,background:THEME_COLORS[theme].bg,display:"flex",flexDirection:"column"}}>
              {/* Header with back button, matching Stats */}
              <div style={{flexShrink:0,padding:"16px 16px 16px",display:"flex",alignItems:"center",gap:8}}>
                <button
                  onTouchStart={e=>{e.preventDefault();pressStart("zone-back",setPressedZoneBack,true);}} onTouchEnd={e=>{e.preventDefault();closeZoneScreen();pressEnd("zone-back",setPressedZoneBack,false);}} onTouchCancel={()=>pressEnd("zone-back",setPressedZoneBack,false)}
                  onMouseDown={()=>pressStart("zone-back",setPressedZoneBack,true)} onMouseUp={()=>{closeZoneScreen();pressEnd("zone-back",setPressedZoneBack,false);}} onMouseLeave={()=>pressEnd("zone-back",setPressedZoneBack,false)}
                  style={{background:"none",border:"none",width:36,height:36,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,flexShrink:0}}>
                  <div style={{width:24,height:24,backgroundColor:TEXT2,WebkitMaskImage:"url(/icons/left.svg)",maskImage:"url(/icons/left.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center",transform:pressedZoneBack?"scale(1.4)":"scale(1)",transition:pressedZoneBack?"transform 0.1s ease-out":"transform 0.4s cubic-bezier(0.34,1.56,0.64,1)"}}/>
                </button>
                <div style={{color:C(0.9),fontFamily:"'SF Pro Display',-apple-system,sans-serif",fontSize:20,lineHeight:"24px",fontWeight:700}}>{isNew?"New Zone":"Edit Zone"}</div>
              </div>
              {/* Scrollable content */}
              <div style={{flex:1,overflowY:"auto",padding:"8px 16px 16px"}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <button onClick={()=>setEmojiPicker(v=>!v)} style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:12,width:40,height:40,fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{zForm.emoji}</button>
                  <input
                    ref={zoneNameInputRef}
                    className={`std-input${zoneNameError?" input-error":""}`}
                    value={zForm.label}
                    onChange={e=>{setZForm(f=>({...f,label:e.target.value.slice(0,38)}));if(e.target.value.trim())setZoneNameError(false);}}
                    placeholder="Zone name"
                    maxLength={38}
                    style={{flex:1,background:"rgba(255,255,255,0.1)",border:zoneNameError?"2px solid #f87171":`1px solid ${C(0.1)}`,color:C(0.9),fontSize:16,lineHeight:"18px",fontWeight:400,fontFamily:"inherit",outline:"none",padding:"0 14px",height:40,boxSizing:"border-box",borderRadius:12}}
                  />
                </div>
                {!isNew&&<button onClick={()=>{deleteZone(z.id);closeZoneScreen();}} style={{marginTop:16,width:"100%",background:"rgba(248,113,113,0.1)",border:"none",borderRadius:14,padding:"13px",color:"#f87171",fontSize:14,fontWeight:600,cursor:"pointer"}}>Delete zone</button>}
              </div>
              {/* Bottom-pinned Add/Save button, shifts up above keyboard via keyboardInset */}
              <div style={{flexShrink:0,padding:"12px 16px",paddingBottom:`calc(12px + ${keyboardInset}px)`,transition:"padding-bottom 0.2s ease"}}>
                <button
                  onTouchStart={e=>{e.preventDefault();pressStart("zone-add",setPressedZoneAdd,true);}} onTouchEnd={e=>{e.preventDefault();submitZone();pressEnd("zone-add",setPressedZoneAdd,false);}} onTouchCancel={()=>pressEnd("zone-add",setPressedZoneAdd,false)}
                  onMouseDown={()=>pressStart("zone-add",setPressedZoneAdd,true)} onMouseUp={()=>{submitZone();pressEnd("zone-add",setPressedZoneAdd,false);}} onMouseLeave={()=>pressEnd("zone-add",setPressedZoneAdd,false)}
                  style={{width:"100%",height:50,boxSizing:"border-box",background:`linear-gradient(135deg,${ACCENT},${ACCENT2})`,border:"none",borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:16,lineHeight:"18px",fontWeight:600,cursor:"pointer",transform:pressedZoneAdd?"scale(1.03)":"scale(1)",transition:pressedZoneAdd?"transform 0.1s ease-out":"transform 0.4s cubic-bezier(0.34,1.56,0.64,1)"}}>{isNew?"Add zone":"Save"}</button>
              </div>
          </div>
          );
        })()}

        {emojiPicker&&zoneExpandId&&(
          <div style={{position:"absolute",inset:0,background:"rgba(10,10,14,0.92)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:350}} onClick={()=>setEmojiPicker(false)}>
            <div onClick={e=>e.stopPropagation()} style={{width:328,...CARD,border:"none",borderRadius:20,padding:16,boxShadow:"0 20px 60px rgba(0,0,0,0.6)"}}>
              <div style={{color:C(0.85),fontSize:15,fontWeight:600,marginBottom:12}}>Choose icon</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:8}}>
                {ZONE_EMOJIS.map(e=><button key={e} onClick={()=>{setZForm(f=>({...f,emoji:e}));setEmojiPicker(false);}} style={{background:zForm.emoji===e?S(0.2):"transparent",border:"none",borderRadius:10,width:"100%",aspectRatio:"1",fontSize:22,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,padding:0}}><span style={{transform:"translateY(-1px)"}}>{e}</span></button>)}
              </div>
            </div>
          </div>
        )}

        {/* ── CELEBRATION MODAL ─────────────────────────────────── */}

        {celebration&&(
          <div onClick={()=>setCelebration(null)} style={{position:"absolute",inset:0,zIndex:400,display:"flex",alignItems:"flex-end",justifyContent:"center",background:"rgba(0,0,0,0.5)",backdropFilter:"blur(8px)"}}>
            {Array.from({length:20},(_,i)=>(
              <div key={i} style={{position:"absolute",left:`${5+(i*17)%90}%`,top:`${5+(i*11)%50}%`,width:8,height:8,borderRadius:i%2?"50%":"2px",background:CONFETTI[i%6],animation:`confettiFall ${0.9+i%3*0.3}s ease ${i%4*0.1}s forwards`,pointerEvents:"none"}}/>
            ))}
            {[0,1,2].map(i=>(
              <div key={i} style={{position:"absolute",left:`${20+i*25}%`,top:"20%",width:50,height:50,borderRadius:"50%",border:`3px solid ${CONFETTI[i*2]}`,animation:`firework 0.8s ease ${i*0.15}s forwards`,pointerEvents:"none"}}/>
            ))}
            <div style={{width:"100%",maxWidth:375,background:"linear-gradient(160deg,#1a1035,#0d2040)",borderRadius:"28px 28px 0 0",padding:"36px 28px 52px",textAlign:"center",animation:"celebUp 0.5s cubic-bezier(0.34,1.4,0.64,1) forwards",boxShadow:"0 -20px 60px rgba(0,0,0,0.6)",border:`1px solid rgba(255,255,255,0.1)`}}>
              <div style={{fontSize:80,marginBottom:14,display:"inline-block",animation:"pulseBig 1s ease infinite"}}>{celebration.emoji}</div>
              <div style={{color:"#fff",fontSize:26,fontWeight:800,letterSpacing:-0.5,marginBottom:8}}>{celebration.title}</div>
              <div style={{color:"rgba(255,255,255,0.45)",fontSize:15,marginBottom:20}}>{celebration.subtitle}</div>
              <div style={{color:"rgba(255,255,255,0.2)",fontSize:12}}>Tap to close</div>
            </div>
          </div>
        )}

        {/* ── PERSON MODAL ──────────────────────────────────────── */}
        {personModal&&(
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.65)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:"0 24px"}} onClick={()=>{setPersonModal(null);setAvatarPicker(false);}}>
            <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:340,...G(0.18,40),borderRadius:24,padding:"22px",display:"flex",flexDirection:"column",gap:16,boxShadow:"0 20px 60px rgba(0,0,0,0.5)"}}>
              <div style={{color:C(0.9),fontSize:18,fontWeight:700}}>{personModal.mode==="new"?"New Person":"Edit Person"}</div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
                <div style={{position:"relative",cursor:"pointer"}} onClick={()=>setAvatarPicker(v=>!v)}>
                  <Avatar person={{name:pForm.name||"?",color:pForm.color,avatarEmoji:pForm.avatarEmoji}} size={72}/>
                </div>
              </div>
              <div>
                <span style={labelSt}>NAME</span>
                <input className={`std-input${personNameError?" input-error":""}`} value={pForm.name} onChange={e=>{setPForm(f=>({...f,name:e.target.value}));if(e.target.value.trim())setPersonNameError(false);}} placeholder="Name" style={{...inputSt,border:personNameError?"2px solid #f87171":`1px solid ${C(0.1)}`}}/>
              </div>
              <div>
                <span style={labelSt}>COLOR</span>
                <div style={{display:"flex",gap:9,flexWrap:"wrap"}}>
                  <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                  {PALETTE.map(c=>(
                    <button key={c} onClick={()=>setPForm(f=>({...f,color:c}))} style={{
                      width:36,height:36,borderRadius:"50%",
                      background:c,
                      border:pForm.color===c?"3px solid #fff":"3px solid transparent",
                      outline:pForm.color===c?`2px solid ${c}`:"none",
                      outlineOffset:2,
                      cursor:"pointer",
                      flexShrink:0,
                      transition:"all 0.15s",
                      boxShadow:pForm.color===c?`0 0 12px ${c}99`:"none",
                    }}/>
                  ))}
                </div>
                </div>
              </div>
              <button onClick={savePerson} style={{background:`linear-gradient(135deg,${ACCENT},${ACCENT2})`,border:"none",borderRadius:15,height:50,boxSizing:"border-box",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:16,lineHeight:"18px",fontWeight:600,cursor:"pointer"}}>{personModal.mode==="new"?"Add":"Save"}</button>
              <button onClick={()=>{setPersonModal(null);setAvatarPicker(false);}} style={{background:"none",border:"none",color:C(0.4),fontSize:13,cursor:"pointer",padding:"4px 0"}}>Cancel</button>
            </div>
          </div>
        )}
        {personModal&&avatarPicker&&(
          <div style={{position:"absolute",inset:0,background:"rgba(10,10,14,0.92)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:250}} onClick={()=>setAvatarPicker(false)}>
            <div onClick={e=>e.stopPropagation()} style={{width:328,background:"#26262c",borderRadius:20,padding:16,boxShadow:"0 20px 60px rgba(0,0,0,0.6)",border:`1px solid ${C(0.12)}`}}>
              <div style={{color:C(0.85),fontSize:15,fontWeight:600,marginBottom:12}}>Choose avatar</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:8}}>
                <button onClick={()=>{setPForm(f=>({...f,avatarEmoji:""}));setAvatarPicker(false);}} style={{background:!pForm.avatarEmoji?S(0.2):"transparent",border:"none",borderRadius:10,width:"100%",aspectRatio:"1",fontSize:15,fontWeight:700,color:pForm.color,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,padding:0}}><span style={{transform:"translateY(-1px)"}}>{initials(pForm.name)||"?"}</span></button>
                {AVATAR_EMOJIS.map(e=>(
                  <button key={e} onClick={()=>{setPForm(f=>({...f,avatarEmoji:e}));setAvatarPicker(false);}} style={{background:pForm.avatarEmoji===e?S(0.2):"transparent",border:"none",borderRadius:10,width:"100%",aspectRatio:"1",fontSize:22,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,padding:0}}><span style={{transform:"translateY(-1px)"}}>{e}</span></button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── ZONE MODAL ────────────────────────────────────────── */}
        {zoneModal&&(
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.65)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200}} onClick={()=>{setZoneModal(null);setEmojiPicker(false);}}>
            <div onClick={e=>e.stopPropagation()} style={{width:375,...G(0.18,40),borderRadius:"30px 30px 0 0",padding:"22px 22px 42px",display:"flex",flexDirection:"column",gap:16,boxShadow:"0 -20px 60px rgba(0,0,0,0.5)"}}>
              <div style={{width:34,height:4,background:S(0.18),borderRadius:2,margin:"0 auto"}}/>
              <div style={{color:C(0.9),fontSize:18,fontWeight:700}}>New Zone</div>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <button onClick={()=>setEmojiPicker(v=>!v)} style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:12,width:40,height:40,fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{zForm.emoji}</button>
                <div style={{flex:1}}>
                  <input className={`std-input${zoneNameError?" input-error":""}`} value={zForm.label} onChange={e=>{setZForm(f=>({...f,label:e.target.value}));if(e.target.value.trim())setZoneNameError(false);}} placeholder="Zone name" style={{background:"rgba(255,255,255,0.1)",borderRadius:14,padding:"0 14px",height:40,color:C(0.9),fontSize:16,lineHeight:"18px",fontWeight:400,width:"100%",boxSizing:"border-box",fontFamily:"inherit",outline:"none",border:zoneNameError?"2px solid #f87171":`1px solid ${C(0.1)}`}}/>
                </div>
              </div>
              <button onClick={saveZone} style={{background:`linear-gradient(135deg,${ACCENT},${ACCENT2})`,border:"none",borderRadius:15,height:50,boxSizing:"border-box",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:16,lineHeight:"18px",fontWeight:600,cursor:"pointer"}}>Add</button>
            </div>
          </div>
        )}
        {zoneModal&&emojiPicker&&(
          <div style={{position:"absolute",inset:0,background:"rgba(10,10,14,0.92)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:250}} onClick={()=>setEmojiPicker(false)}>
            <div onClick={e=>e.stopPropagation()} style={{width:328,background:"#26262c",borderRadius:20,padding:16,boxShadow:"0 20px 60px rgba(0,0,0,0.6)",border:`1px solid ${C(0.12)}`}}>
              <div style={{color:C(0.85),fontSize:15,fontWeight:600,marginBottom:12}}>Choose icon</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:8}}>
                {ZONE_EMOJIS.map(e=><button key={e} onClick={()=>{setZForm(f=>({...f,emoji:e}));setEmojiPicker(false);}} style={{background:zForm.emoji===e?S(0.2):"transparent",border:"none",borderRadius:10,width:"100%",aspectRatio:"1",fontSize:22,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,padding:0}}><span style={{transform:"translateY(-1px)"}}>{e}</span></button>)}
              </div>
            </div>
          </div>
        )}

      </div>{/* end phone shell */}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Auth + household onboarding
// ═══════════════════════════════════════════════════════════════════════════

const SHELL_STYLE={height:"100%",background:"#08080f",display:"flex",justifyContent:"center",alignItems:"stretch",fontFamily:"'SF Pro Text',-apple-system,system-ui,sans-serif",overflow:"hidden"};
const CARD_BG="linear-gradient(160deg,#1a1035 0%,#0d1f3c 45%,#0a2a1f 100%)";
const AUTH_INPUT={background:"rgba(255,255,255,0.1)",borderRadius:14,padding:"0 16px",height:40,boxSizing:"border-box",color:"#fff",fontSize:16,lineHeight:"18px",fontWeight:400,width:"100%",fontFamily:"inherit",outline:"none",border:"1px solid rgba(255,255,255,0.1)"};
const AUTH_BTN={background:"linear-gradient(135deg,#7163F3,#5E51E0)",border:"none",borderRadius:16,padding:"14px",color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",width:"100%"};

function LoginScreen(){
  const [email,setEmail]=useState("");
  const [sent,setSent]=useState(false);
  const [code,setCode]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [usePassword,setUsePassword]=useState(false);
  const [password,setPassword]=useState("");

  const sendCode=async()=>{
    if(!email.trim()||!email.includes("@")){setError("Enter a valid email");return;}
    setError(""); setLoading(true);
    try{
      const {error}=await withRetry(()=>supabase.auth.signInWithOtp({ email:email.trim() }));
      setLoading(false);
      if(error){setError(`${error.status||""} ${error.message||error.error_description||String(error)}`.trim());return;}
      setSent(true);
    }catch(err){
      setLoading(false);
      setError("Network error: "+String(err?.message||err)+" — please try again.");
    }
  };

  const verifyCode=async()=>{
    if(!code.trim()){setError("Enter the code from your email");return;}
    setError(""); setLoading(true);
    try{
      const {error}=await withRetry(()=>supabase.auth.verifyOtp({ email:email.trim(), token:code.trim(), type:"email" }));
      setLoading(false);
      if(error){setError(`${error.status||""} ${error.message||error.error_description||String(error)}`.trim());return;}
      // on success, the auth listener in Root picks up the new session automatically
    }catch(err){
      setLoading(false);
      setError("Network error: "+String(err?.message||err)+" — please try again.");
    }
  };

  const loginWithPassword=async()=>{
    if(!email.trim()||!email.includes("@")){setError("Enter a valid email");return;}
    if(!password){setError("Enter your password");return;}
    setError(""); setLoading(true);
    try{
      const {error}=await withRetry(()=>supabase.auth.signInWithPassword({ email:email.trim(), password }));
      setLoading(false);
      if(error){setError(`${error.status||""} ${error.message||error.error_description||String(error)}`.trim());return;}
      // on success, the auth listener in Root picks up the new session automatically
    }catch(err){
      setLoading(false);
      setError("Network error: "+String(err?.message||err)+" — please try again.");
    }
  };

  return (
    <div style={SHELL_STYLE}>
      <div style={{width:"100%",maxWidth:480,display:"flex",flexDirection:"column",justifyContent:"center",padding:"32px 28px",background:CARD_BG}}>
        <div style={{fontSize:40,marginBottom:16,textAlign:"center"}}>🏠</div>
        <div style={{color:"#fff",fontSize:24,fontWeight:700,textAlign:"center",marginBottom:8}}>Home Tasks</div>
        <div style={{color:"rgba(255,255,255,0.4)",fontSize:14,textAlign:"center",marginBottom:32}}>Shared chores for your household</div>

        {sent?(
          <>
            <div style={{textAlign:"center",marginBottom:20}}>
              <div style={{fontSize:32,marginBottom:12}}>📬</div>
              <div style={{color:"rgba(255,255,255,0.85)",fontSize:15,marginBottom:8}}>Check your email</div>
              <div style={{color:"rgba(255,255,255,0.4)",fontSize:13}}>We sent a code to {email}</div>
            </div>
            <input
              className={`std-input${error?" input-error":""}`}
              type="tel" inputMode="numeric" autoComplete="one-time-code" maxLength={10}
              placeholder="Enter the code"
              value={code}
              onChange={e=>{setCode(e.target.value.replace(/\D/g,""));setError("");}}
              style={{...AUTH_INPUT,marginBottom:8,textAlign:"center",letterSpacing:3,fontSize:20,border:error?"2px solid #f87171":"1px solid rgba(255,255,255,0.1)"}}
            />
            <div style={{minHeight:16,marginBottom:8}}>
              {error&&<div style={{color:"#f87171",fontSize:12}}>{error}</div>}
            </div>
            <button onClick={verifyCode} disabled={loading} style={{...AUTH_BTN,opacity:loading?0.6:1}}>
              {loading?"Checking…":"Confirm code"}
            </button>
            <button onClick={()=>{setSent(false);setCode("");setError("");}} style={{background:"none",border:"none",color:"rgba(255,255,255,0.35)",fontSize:13,cursor:"pointer",padding:"12px",width:"100%"}}>Use a different email</button>
          </>
        ):usePassword?(
          <>
            <input
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="you@example.com"
              value={email}
              onChange={e=>{setEmail(e.target.value);setError("");}}
              className={`std-input${error?" input-error":""}`} style={{...AUTH_INPUT,marginBottom:8,border:error?"2px solid #f87171":"1px solid rgba(255,255,255,0.1)"}}
            />
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={e=>{setPassword(e.target.value);setError("");}}
              className={`std-input${error?" input-error":""}`} style={{...AUTH_INPUT,marginBottom:8,border:error?"2px solid #f87171":"1px solid rgba(255,255,255,0.1)"}}
            />
            <div style={{minHeight:16,marginBottom:8}}>
              {error&&<div style={{color:"#f87171",fontSize:12}}>{error}</div>}
            </div>
            <button onClick={loginWithPassword} disabled={loading} style={{...AUTH_BTN,opacity:loading?0.6:1}}>
              {loading?"Signing in…":"Sign in"}
            </button>
            <button onClick={()=>{setUsePassword(false);setPassword("");setError("");}} style={{background:"none",border:"none",color:"rgba(255,255,255,0.35)",fontSize:13,cursor:"pointer",padding:"12px",width:"100%"}}>Use a login code instead</button>
          </>
        ):(
          <>
            <input
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="you@example.com"
              value={email}
              onChange={e=>{setEmail(e.target.value);setError("");}}
              className={`std-input${error?" input-error":""}`} style={{...AUTH_INPUT,marginBottom:8,border:error?"2px solid #f87171":"1px solid rgba(255,255,255,0.1)"}}
            />
            <div style={{minHeight:16,marginBottom:8}}>
              {error&&<div style={{color:"#f87171",fontSize:12}}>{error}</div>}
            </div>
            <button onClick={sendCode} disabled={loading} style={{...AUTH_BTN,opacity:loading?0.6:1}}>
              {loading?"Sending…":"Send login code"}
            </button>
            <button onClick={()=>{setUsePassword(true);setError("");}} style={{background:"none",border:"none",color:"rgba(255,255,255,0.35)",fontSize:13,cursor:"pointer",padding:"12px",width:"100%"}}>Have a password? Sign in instead</button>
          </>
        )}
      </div>
    </div>
  );
}

function HouseholdGate({session,onReady}){
  const [mode,setMode]=useState(null); // null | "create" | "join"
  const [name,setName]=useState("");
  const [inviteCode,setInviteCode]=useState("");
  const [color,setColor]=useState(PALETTE[0]);
  const [avatarEmoji,setAvatarEmoji]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [checking,setChecking]=useState(true);

  // If this auth user is already linked to a person, skip straight in
  useEffect(()=>{
    (async()=>{
      const {data}=await supabase.from("people").select("*").eq("auth_user_id",session.user.id).maybeSingle();
      if(data){
        const {data:household}=await supabase.from("households").select("*").eq("id",data.household_id).single();
        onReady({household,me:{id:data.id,name:data.name,color:data.color,avatarEmoji:data.avatar_emoji}});
        return;
      }
      setChecking(false);
    })();
  },[]);

  const createHousehold=async()=>{
    if(!name.trim()){setError("Enter your name");return;}
    setBusy(true); setError("");
    const personId=String(Date.now());
    try{
      const {data:household,error:hErr}=await withRetry(()=>supabase.rpc("create_household_with_person",{
        p_person_id:personId,p_name:name.trim(),p_color:color,p_avatar:avatarEmoji,
      }).single());
      if(hErr){setBusy(false);setError(hErr.message);return;}
      // zones are now seeded atomically inside create_household_with_person itself
      onReady({household,me:{id:personId,name:name.trim(),color,avatarEmoji}});
    }catch(err){
      setBusy(false);
      setError("Network error: "+String(err?.message||err)+" — please try again.");
    }
  };

  const joinHousehold=async()=>{
    if(!name.trim()){setError("Enter your name");return;}
    if(!inviteCode.trim()){setError("Enter the invite code");return;}
    setBusy(true); setError("");
    const personId=(typeof crypto!=="undefined"&&crypto.randomUUID)?crypto.randomUUID():String(Date.now());
    try{
      const {data:household,error:hErr}=await withRetry(()=>supabase.rpc("join_household_by_code",{
        p_code:inviteCode.trim().toLowerCase(),p_person_id:personId,p_name:name.trim(),p_color:color,p_avatar:avatarEmoji,
      }).single());
      if(hErr){setBusy(false);setError(hErr.message.includes("not found")?"Invite code not found":hErr.message);return;}
      supabase.from("notifications").insert({
        household_id:household.id,actor_person_id:personId,icon:"👋",
        title:`${name.trim()} joined the home!`,body:"Say hi and split up the chores 🎉",
      }).then(({error})=>{ if(error) console.error("insert join notification",error); });
      onReady({household,me:{id:personId,name:name.trim(),color,avatarEmoji}});
    }catch(err){
      setBusy(false);
      setError("Network error: "+String(err?.message||err)+" — please try again.");
    }
  };

  if(checking){
    return <div style={SHELL_STYLE}><div style={{margin:"auto",color:"rgba(255,255,255,0.4)"}}>Loading…</div></div>;
  }

  if(!mode){
    return (
      <div style={SHELL_STYLE}>
        <div style={{width:"100%",maxWidth:480,display:"flex",flexDirection:"column",justifyContent:"center",padding:"32px 28px",background:CARD_BG,gap:14}}>
          <div style={{fontSize:40,marginBottom:8,textAlign:"center"}}>🏠</div>
          <div style={{color:"#fff",fontSize:22,fontWeight:700,textAlign:"center",marginBottom:20}}>Set up your home</div>
          <button onClick={()=>setMode("create")} style={AUTH_BTN}>Create a new home</button>
          <button onClick={()=>setMode("join")} style={{...AUTH_BTN,background:"rgba(255,255,255,0.08)",boxShadow:"none",border:`1px solid rgba(255,255,255,0.15)`}}>Join with invite code</button>
        </div>
      </div>
    );
  }

  return (
    <div style={SHELL_STYLE}>
      <div style={{width:"100%",maxWidth:480,display:"flex",flexDirection:"column",justifyContent:"center",padding:"32px 28px",background:CARD_BG,gap:12,overflowY:"auto"}}>
        <button onClick={()=>{setMode(null);setError("");}} style={{background:"none",border:"none",color:"rgba(255,255,255,0.4)",fontSize:14,cursor:"pointer",textAlign:"left",padding:0,marginBottom:8,display:"flex",alignItems:"center",gap:4}}><div style={{width:24,height:24,backgroundColor:"rgba(255,255,255,0.4)",WebkitMaskImage:"url(/icons/left.svg)",maskImage:"url(/icons/left.svg)",WebkitMaskSize:"contain",maskSize:"contain",WebkitMaskRepeat:"no-repeat",maskRepeat:"no-repeat",WebkitMaskPosition:"center",maskPosition:"center"}}/>Back</button>
        <div style={{color:"#fff",fontSize:20,fontWeight:700,marginBottom:8}}>{mode==="create"?"Create your home":"Join a home"}</div>

        {mode==="join"&&(
          <>
            <span style={{color:"rgba(255,255,255,0.4)",fontSize:12,fontWeight:600}}>Invite code</span>
            <input placeholder="e.g. a1b2c3" value={inviteCode} onChange={e=>setInviteCode(e.target.value)} style={AUTH_INPUT}/>
          </>
        )}
        <span style={{color:"rgba(255,255,255,0.4)",fontSize:12,fontWeight:600}}>Your name</span>
        <input placeholder="e.g. Anya" value={name} onChange={e=>setName(e.target.value)} style={AUTH_INPUT}/>

        <span style={{color:"rgba(255,255,255,0.4)",fontSize:12,fontWeight:600}}>Your color</span>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {PALETTE.map(c=>(
            <button key={c} onClick={()=>setColor(c)} style={{width:32,height:32,borderRadius:"50%",background:c,border:color===c?"3px solid #fff":"3px solid transparent",cursor:"pointer"}}/>
          ))}
        </div>

        <div style={{height:16}}>{error&&<div style={{color:"#f87171",fontSize:12}}>{error}</div>}</div>

        <button onClick={mode==="create"?createHousehold:joinHousehold} disabled={busy} style={{...AUTH_BTN,opacity:busy?0.6:1}}>
          {busy?"One moment…":mode==="create"?"Create home":"Join home"}
        </button>
      </div>
    </div>
  );
}

export default function Root(){
  const [session,setSession]=useState(null);
  const [authLoading,setAuthLoading]=useState(true);
  const [me,setMe]=useState(null);
  const [household,setHousehold]=useState(null);
  const currentUserIdRef=useRef(null);

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{
      setSession(data.session);
      currentUserIdRef.current=data.session?.user?.id||null;
      setAuthLoading(false);
    });
    const {data:listener}=supabase.auth.onAuthStateChange((_event,newSession)=>{
      const newUserId=newSession?.user?.id||null;
      if(newUserId!==currentUserIdRef.current){
        // a different person just signed in (or everyone signed out) — never
        // carry over the previous person's household/profile into this session
        setHousehold(null);
        setMe(null);
        currentUserIdRef.current=newUserId;
      }
      setSession(newSession);
    });
    return ()=>listener.subscription.unsubscribe();
  },[]);

  if(authLoading){
    return <div style={{height:"100dvh",...SHELL_STYLE}}><div style={{margin:"auto",color:"rgba(255,255,255,0.4)"}}>Loading…</div></div>;
  }
  if(!session){
    return <div style={{height:"100dvh"}}><LoginScreen/></div>;
  }
  if(!household||!me){
    return <div style={{height:"100dvh"}}><HouseholdGate session={session} onReady={({household,me})=>{setHousehold(household);setMe(me);}}/></div>;
  }
  return (
    <div style={{height:"100dvh"}}>
      <MainApp household={household} me={me} email={session?.user?.email} onSignOut={()=>supabase.auth.signOut()}/>
    </div>
  );
}
