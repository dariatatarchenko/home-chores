import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { supabase } from "./supabaseClient";

// ─── Theme ────────────────────────────────────────────────────────────────────
const G = (o=0.1,b=20) => ({
  background:`rgba(255,255,255,${o})`,
  backdropFilter:`blur(${b}px) saturate(180%)`,
  WebkitBackdropFilter:`blur(${b}px) saturate(180%)`,
  border:"1px solid rgba(255,255,255,0.12)",
});
const CARD = { ...G(0.08,24), borderRadius:20, padding:"13px 15px" };
const BG = "linear-gradient(160deg,#1a1035 0%,#0d1f3c 45%,#0a2a1f 100%)";

// ─── Gamification ─────────────────────────────────────────────────────────────
const RANKS = [
  {min:0,    label:"Rookie",  icon:"🧹", color:"#94a3b8"},
  {min:50,   label:"Cleaner", icon:"🪣", color:"#34d399"},
  {min:150,  label:"Pro",     icon:"⭐", color:"#fbbf24"},
  {min:300,  label:"Expert",  icon:"🔥", color:"#fb923c"},
  {min:500,  label:"Master",  icon:"💎", color:"#818cf8"},
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
const computePts = (tasks,pid) => tasks.filter(t=>t.personId===pid).reduce((s,t)=>s+t.doneOn.length,0);
const getWeekStats = (tasks,pid,dates) => {
  const my=tasks.filter(t=>t.personId===pid);
  let done=0,total=0;
  dates.forEach(d=>{
    const dt=my.filter(t=>t.scheduledDates.includes(d));
    total+=dt.length;
    done+=dt.filter(t=>t.doneOn.includes(d)).length;
  });
  return {done,total,pct:total===0?0:Math.round(done/total*100)};
};
const getZoneAch=(tasks,pid)=>ZONE_ACH.map(za=>({...za,ach:getZoneAchLevel(tasks,pid,za.zone)})).filter(z=>z.ach);

// ─── Constants ────────────────────────────────────────────────────────────────
const ZONES_DEFAULT = [
  {id:"kitchen",  label:"Kitchen",     emoji:"🍳"},
  {id:"bathroom", label:"Bathroom",    emoji:"🚿"},
  {id:"living",   label:"Living Room", emoji:"🛋️"},
  {id:"bedroom",  label:"Bedroom",     emoji:"🛏️"},
  {id:"hall",     label:"Hallway",     emoji:"🚪"},
  {id:"pets",     label:"Pets",        emoji:"🐾"},
];
const ZONE_EMOJIS = ["🍳","🚿","🛋️","🛏️","🚪","📦","🌿","🪟","🧹","🧺","🪣","🛁","🚽","🧴","🪴","🖥️","📚","🎮","🧸","🐾","🚗","🏋️","🎨","🎵"];
const AVATAR_EMOJIS = ["😀","😎","🥳","🦊","🐱","🐶","🐼","🦁","🌟","🎯","🍀","🔥","💎","🎸","🚀","🌈"];
const PALETTE = ["#f87171","#fb923c","#fbbf24","#34d399","#38bdf8","#818cf8","#e879f9","#94a3b8"];
const CONFETTI = ["#f87171","#fbbf24","#34d399","#818cf8","#e879f9","#38bdf8"];

const FREQ_OPTIONS = [
  {id:"once",    label:"Once",         days:null},
  {id:"daily",   label:"Every day",    days:1},
  {id:"every2",  label:"Every 2 days", days:2},
  {id:"every3",  label:"Every 3 days", days:3},
  {id:"weekly",  label:"Weekly",       days:7},
  {id:"monthly", label:"Monthly",      days:30},
  {id:"custom",  label:"Custom...",    days:null},
];
const FREQ_COLOR = {once:"#cbd5e1",daily:"#818cf8",every2:"#a78bfa",every3:"#c084fc",weekly:"#e879f9",monthly:"#cbd5e1",custom:"#38bdf8"};

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
  const scores=people.map(p=>({p,pts:tasks.filter(t=>t.personId===p.id).reduce((s,t)=>s+dates.filter(d=>t.doneOn.includes(d)).length*(FREQ_PTS[t.freq]||1),0)}));
  scores.sort((a,b)=>b.pts-a.pts);
  return scores[0].pts>0&&scores[0].pts>scores[1].pts?scores[0].p:null;
};

const getDreamTeam=(tasks,people,dates)=>
  people.length>=2&&people.every(p=>tasks.filter(t=>t.personId===p.id).some(t=>dates.some(d=>t.doneOn.includes(d))));

const getZoneAchLevel=(tasks,pid,zone)=>{
  const cnt=tasks.filter(t=>(t.personIds&&t.personIds.length?t.personIds:[t.personId]).includes(pid)&&t.zone===zone).reduce((s,t)=>s+t.doneOn.length,0);
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

let _uid=300; const uid=()=>String(_uid++);
const initials = n => (n||"?").split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);

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
    const myT=task.scheduledDates.includes(dStr);
    if(!myT) continue;
    if(task.doneOn.includes(dStr)) streak++;
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
      <span style={{fontSize:person.avatarEmoji?size*.68:size*.46,fontWeight:700,color:person.avatarEmoji?undefined:person.color,lineHeight:1}}>
        {person.avatarEmoji||initials(person.name)}
      </span>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
function MainApp({household, me:initialMe, onSignOut}){
  useEffect(()=>{
    const setVh=()=>{
      document.documentElement.style.setProperty("--app-height",`${window.innerHeight}px`);
    };
    setVh();
    window.addEventListener("resize",setVh);
    window.addEventListener("orientationchange",setVh);
    return ()=>{
      window.removeEventListener("resize",setVh);
      window.removeEventListener("orientationchange",setVh);
    };
  },[]);
  const [tasks,   setTasks]   = useState([]);
  const [people,  setPeople]  = useState([]);
  const [zones,   setZones]   = useState([]);
  const [dataLoading,setDataLoading]=useState(true);
  const [tab,     setTab]     = useState("week");
  const [returnTab,setReturnTab]= useState("week");
  const [selDay,  setSelDay]  = useState(todayStr);
  const [meId,    setMeId]    = useState(initialMe.id);

  // ── Load data from Supabase + realtime sync ──────────────────────────────
  const rowToPerson=r=>({id:r.id,name:r.name,color:r.color,avatarEmoji:r.avatar_emoji||""});
  const rowToZone=r=>({id:r.id,label:r.label,emoji:r.emoji});
  const rowToTask=r=>({
    id:r.id,zone:r.zone_id,text:r.text,freq:r.freq,customDays:r.custom_days,
    personIds:r.person_ids||[],personId:(r.person_ids||[])[0]||null,
    scheduledDates:r.scheduled_dates||[],doneOn:r.done_on||[],likes:r.likes||[],
    rescheduledFrom:r.rescheduled_from,
  });

  useEffect(()=>{
    let active=true;
    (async()=>{
      const [{data:p},{data:z},{data:t}]=await Promise.all([
        supabase.from("people").select("*").eq("household_id",household.id),
        supabase.from("zones").select("*").eq("household_id",household.id),
        supabase.from("tasks").select("*").eq("household_id",household.id),
      ]);
      if(!active) return;
      setPeople((p||[]).map(rowToPerson));
      setZones((z||[]).map(rowToZone));
      setTasks((t||[]).map(rowToTask));
      setDataLoading(false);
    })();

    const channel=supabase.channel(`household-${household.id}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"tasks",filter:`household_id=eq.${household.id}`},payload=>{
        if(payload.eventType==="DELETE"){
          setTasks(ts=>ts.filter(t=>t.id!==payload.old.id));
        } else {
          const row=rowToTask(payload.new);
          setTasks(ts=>{
            const exists=ts.some(t=>t.id===row.id);
            return exists?ts.map(t=>t.id===row.id?row:t):[...ts,row];
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
            return exists?zs.map(z=>z.id===row.id?row:z):[...zs,row];
          });
        }
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
    dbFields.updated_at=new Date().toISOString();
    supabase.from("tasks").update(dbFields).eq("id",id).then(({error})=>{ if(error) console.error("persistTask",error); });
  };
  const insertTask=row=>{
    supabase.from("tasks").insert({
      id:row.id,household_id:household.id,zone_id:row.zone,text:row.text,freq:row.freq,
      custom_days:row.customDays,person_ids:row.personIds,scheduled_dates:row.scheduledDates,
      done_on:row.doneOn,likes:row.likes,rescheduled_from:row.rescheduledFrom,
    }).then(({error})=>{ if(error) console.error("insertTask",error); });
  };
  const deleteTaskRemote=id=>{
    supabase.from("tasks").delete().eq("id",id).then(({error})=>{ if(error) console.error("deleteTask",error); });
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
  const deletePersonRemote=id=>{
    supabase.from("people").delete().eq("id",id).then(({error})=>{ if(error) console.error("deletePerson",error); });
  };
  const persistZone=(id,fields)=>{
    const dbFields={};
    if("label" in fields) dbFields.label=fields.label;
    if("emoji" in fields) dbFields.emoji=fields.emoji;
    supabase.from("zones").update(dbFields).eq("id",id).then(({error})=>{ if(error) console.error("persistZone",error); });
  };
  const insertZone=z=>{
    supabase.from("zones").insert({id:z.id,household_id:household.id,label:z.label,emoji:z.emoji}).then(({error})=>{ if(error) console.error("insertZone",error); });
  };
  const deleteZoneRemote=id=>{
    supabase.from("zones").delete().eq("id",id).then(({error})=>{ if(error) console.error("deleteZone",error); });
  };

  const [myFilter,setMyFilter]= useState(false);
  const [weekZoneFilter,setWeekZoneFilter]= useState(null);
  const [weekOff, setWeekOff] = useState(0);
  const [calYear, setCalYear] = useState(TODAY.getFullYear());
  const [calMonth,setCalMonth]= useState(TODAY.getMonth());
  const [dragInfo,setDragInfo]= useState(null);
  const [dragOver,setDragOver]= useState(null);
  const [expandId,setExpandId]= useState(null);
  const [editTaskId,setEditTaskId]= useState(null);
  const [freeze,setFreeze]= useState(null); // {day, order:[ids]} — frozen render order during the 400ms hold
  const [justLiked,setJustLiked]= useState(null);
  const [activityOrder,setActivityOrder]= useState([]); // array of "id|date" keys, most recent action first (either direction)
  const [showStats,setShowStats]= useState(false);
  const [celebration,setCelebration]= useState(null);
  const [showNotifs,setShowNotifs]= useState(false);
  const [notifs,setNotifs]= useState([
    {id:"n1",icon:"🎯",from:"Misha liked your task",text:"Wipe the stove — nailed it!",read:false},
    {id:"n2",icon:"🏆",from:"Anya is on fire!",text:"3-day streak on Kitchen tasks",read:false},
  ]);
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
  const [assigneePopover,setAssigneePopover]= useState(null);

  const blankForm = {zone:"kitchen",text:"",freq:"daily",personIds:people.map(p=>p.id),customDays:4,startDate:todayStr,maxLen:22};
  const [form,setForm]= useState(blankForm);

  const prevPct = useRef(0);
  const stripRef = useRef(null);
  const cardRefs = useRef({});
  const prevRects = useRef({});
  const taskNameRef = useRef(null);
  const assigneeRef = useRef(null);

  // Celebration is now triggered directly inside toggleDone (only on the actual completing action)

  // ── Scroll today to center ────────────────────────────────────────────────
  useEffect(()=>{
    if(!stripRef.current) return;
    const el=stripRef.current;
    const visWeekLocal=Array.from({length:11},(_,i)=>{const d=new Date(TODAY);d.setDate(TODAY.getDate()+weekOff-5+i);return d;});
    const todayIdx=visWeekLocal.findIndex(d=>ds(d)===todayStr);
    if(todayIdx<0) return;
    const cellW=51;
    el.scrollLeft=Math.max(0,todayIdx*cellW-(el.clientWidth/2)+(cellW/2));
  },[]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const isDone=(t,d)=>t.doneOn.includes(d);
  const isScheduledOn=(t,d)=>{
    if(t.scheduledDates.includes(d)) return true;
    // For repeating tasks, extrapolate beyond stored dates
    if(!t.freq||t.freq==="once") return false;
    const f=FREQ_OPTIONS.find(x=>x.id===t.freq);
    const days=t.freq==="custom"?t.customDays:f?.days;
    if(!days) return false;
    const first=t.scheduledDates[0];
    if(!first||d<first) return false;
    const diff=Math.round((new Date(d)-new Date(first))/(1000*60*60*24));
    return diff%days===0;
  };
  const dayTasks=d=>tasks.filter(t=>isScheduledOn(t,d));
  const getPerson=id=>people.find(p=>p.id===id);
  const getZone=id=>zones.find(z=>z.id===id);
  const unread=notifs.filter(n=>!n.read).length;
  const me=getPerson(meId);

  const toggleDone=(id,d)=>{
    const t=tasks.find(x=>x.id===id);
    const becomingDone=t&&!isDone(t,d);
    const key=id+"|"+d;
    if(becomingDone){
      const isLastUndone=d===selDay&&undoneRaw.length>0&&undoneRaw[undoneRaw.length-1].id===id;
      if(!isLastUndone&&d===selDay){
        setFreeze({day:d,order:selTasks.map(x=>x.id)});
        setTimeout(()=>setFreeze(null),400);
      }
      // Celebration: only when THIS action completes every task scheduled for that day
      const dayAll=tasks.filter(x=>x.scheduledDates.includes(d));
      const nowAllDone=dayAll.length>0&&dayAll.every(x=>x.id===id||x.doneOn.includes(d));
      if(nowAllDone&&tab==="week"){
        const isToday=d===todayStr, isPast=d<todayStr;
        const dateLabel=isToday?"today":isPast?new Date(d+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}):"this day";
        setCelebration({title:"Day Complete! 🎉",subtitle:`All tasks done for ${dateLabel}!`,emoji:"🎉"});
        setTimeout(()=>setCelebration(null),3500);
      }
    } else {
      const wasTopDone=d===selDay&&doneRawSorted.length>0&&doneRawSorted[0].id===id;
      if(!wasTopDone&&d===selDay){
        setFreeze({day:d,order:selTasks.map(x=>x.id)});
        setTimeout(()=>setFreeze(null),400);
      }
    }
    setActivityOrder(o=>[key,...o.filter(k=>k!==key)]);
    const newDoneOn=isDone(t,d)?t.doneOn.filter(x=>x!==d):[...t.doneOn,d];
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
      const m=MOTIV[Math.floor(Math.random()*MOTIV.length)];
      const liker=getPerson(meId);
      const isOwn=(t.personIds||[t.personId]).includes(meId);
      const from=isOwn?`${liker?.name||"Someone"} liked their own task`:`${liker?.name||"Someone"} liked your task`;
      const newN={id:uid(),icon:m.icon,from,text:`${t.text} — ${m.text}`,read:false};
      setNotifs(ns=>[newN,...ns]);
    }
  };

  const moveTask=(id,from,to)=>{
    if(from===to) return;
    let newFields=null;
    setTasks(ts=>ts.map(t=>{
      if(t.id!==id) return t;
      const dates=[...new Set([...t.scheduledDates.filter(x=>x!==from),to])].sort();
      newFields={scheduledDates:dates,doneOn:t.doneOn.filter(x=>x!==from),rescheduledFrom:from};
      return{...t,...newFields};
    }));
    if(newFields) persistTask(id,newFields);
    setSelDay(to);
  };

  const saveTask=()=>{
    if(!form.text.trim()){
      setTaskNameError(true);
      taskNameRef.current?.scrollIntoView({behavior:"smooth",block:"center"});
      taskNameRef.current?.focus();
      return;
    }
    const f=FREQ_OPTIONS.find(x=>x.id===form.freq);
    let days=f?.days;
    if(form.freq==="custom") days=form.customDays;
    const startIdx=Math.max(0,_60.indexOf(form.startDate||todayStr));
    const base=_60.slice(startIdx);
    const dates=days?base.filter((_,i)=>i%days===0):[form.startDate||selDay];
    if(editTaskId){
      const updated={...form,personId:form.personIds[0]||null,scheduledDates:dates};
      setTasks(ts=>ts.map(t=>t.id!==editTaskId?t:{...t,...updated}));
      persistTask(editTaskId,updated);
      setEditTaskId(null);
    } else {
      const newTask={id:uid(),...form,personId:form.personIds[0]||null,scheduledDates:dates,doneOn:[],likes:[],rescheduledFrom:null};
      setTasks(ts=>[...ts,newTask]);
      insertTask(newTask);
    }
    setForm(blankForm);
    if(dates[0]) setSelDay(dates[0]);
    setTab("week");
  };

  const savePerson=()=>{
    if(!pForm.name.trim()){setPersonNameError(true);return;}
    if(personModal.mode==="new"){
      const newId=uid();
      const np={id:newId,name:pForm.name.trim(),color:pForm.color,avatarEmoji:pForm.avatarEmoji};
      setPeople(ps=>[...ps,np]);
      insertPerson(np);
      if(pForm._tempMe) setMeId(newId);
    } else {
      const updated={name:pForm.name.trim(),color:pForm.color,avatarEmoji:pForm.avatarEmoji};
      setPeople(ps=>ps.map(p=>p.id===personModal.id?{...p,...updated}:p));
      persistPerson(personModal.id,updated);
    }
    setPersonModal(null); setAvatarPicker(false);
  };
  const deletePerson=id=>{
    setPeople(ps=>ps.filter(p=>p.id!==id));
    setTasks(ts=>ts.map(t=>t.personId===id?{...t,personId:null}:t));
    deletePersonRemote(id);
    if(meId===id) setMeId(people[0]?.id??"");
  };

  const saveZone=()=>{
    if(!zForm.label.trim()){setZoneNameError(true);return;}
    if(zoneModal.mode==="new"){
      const nz={id:uid(),label:zForm.label.trim(),emoji:zForm.emoji};
      setZones(zs=>[...zs,nz]);
      insertZone(nz);
    } else {
      const updated={label:zForm.label.trim(),emoji:zForm.emoji};
      setZones(zs=>zs.map(z=>z.id===zoneModal.id?{...z,...updated}:z));
      persistZone(zoneModal.id,updated);
    }
    setZoneModal(null); setEmojiPicker(false);
  };
  const deleteZone=id=>{
    setZones(zs=>zs.filter(z=>z.id!==id));
    setTasks(ts=>ts.filter(t=>t.zone!==id));
    deleteZoneRemote(id);
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
  const groupedZones=zones.map(z=>({...z,tasks:tasks.filter(t=>t.zone===z.id)})).filter(z=>z.tasks.length>0);

  const myStreak=(()=>{
    let streak=0;
    for(let i=1;i<=90;i++){
      const d=new Date(TODAY); d.setDate(TODAY.getDate()-i);
      const dStr=ds(d);
      const myT=tasks.filter(t=>(t.personIds||[t.personId]).includes(meId)&&t.scheduledDates.includes(dStr));
      if(myT.length===0){
        // no tasks this day — only skip if it's a gap in schedule, not a missed day
        continue;
      }
      if(myT.every(t=>t.doneOn.includes(dStr))) streak++;
      else break;
    }
    return streak;
  })();

  const dayLabel=d=>{
    if(d===todayStr) return "Today";
    const tom=new Date(TODAY); tom.setDate(TODAY.getDate()+1);
    if(d===ds(tom)) return "Tomorrow";
    return new Date(d+"T00:00:00").toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"});
  };

  const inputSt={...G(0.1,20),borderRadius:14,padding:"12px 14px",color:"#fff",fontSize:15,width:"100%",boxSizing:"border-box",fontFamily:"inherit",outline:"none",border:"1px solid rgba(255,255,255,0.1)"};
  const labelSt={color:"rgba(255,255,255,0.6)",fontSize:13,fontWeight:600,marginBottom:8,display:"block"};

  const TABS=[
    {id:"week",     emoji:"📅",label:"Week"},
    {id:"calendar", emoji:"📆",label:"Calendar"},
    {id:"add",      emoji:"＋",label:"",accent:true},
    {id:"tasks",    emoji:"📋",label:"Tasks"},
    {id:"settings", emoji:"⚙️",label:"Settings"},
  ];

  if(dataLoading){
    return (
      <div style={{height:"100%",background:"#08080f",display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(255,255,255,0.4)",fontFamily:"'Inter',system-ui,sans-serif"}}>
        Loading your home…
      </div>
    );
  }

  return (
    <div style={{height:"100%",background:"#08080f",display:"flex",justifyContent:"center",alignItems:"stretch",fontFamily:"'Inter',system-ui,sans-serif",overflow:"hidden"}}>
      <style>{`
        html,body,#root{height:100%;margin:0;background:#08080f;}
        html,body{position:fixed;inset:0;width:100%;}
        #root{width:100%;overflow:hidden;}
        body{overflow:hidden;overscroll-behavior:none;}
        @keyframes slideDown{from{opacity:0;transform:translateX(-50%) translateY(-12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        @keyframes confettiFall{0%{transform:translateY(-10px) rotate(0deg);opacity:1}100%{transform:translateY(110px) rotate(720deg);opacity:0}}
        @keyframes celebUp{0%{transform:translateY(100%);opacity:0}20%{transform:translateY(-6px);opacity:1}30%{transform:translateY(0)}100%{transform:translateY(0);opacity:1}}
        @keyframes heartPop{0%{transform:scale(1)}40%{transform:scale(1.6)}70%{transform:scale(0.9)}100%{transform:scale(1)}}
        @keyframes checkPop{0%{transform:scale(0) rotate(-20deg);opacity:0}60%{transform:scale(1.3) rotate(5deg);opacity:1}100%{transform:scale(1) rotate(0);opacity:1}}
        @keyframes pulseBig{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
        @keyframes firework{0%{transform:scale(0);opacity:1}100%{transform:scale(2.5);opacity:0}}
        @keyframes fadeInUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        ::-webkit-scrollbar{display:none}
        *{-webkit-tap-highlight-color:transparent}
      `}</style>

      {/* Phone shell */}
      <div style={{width:"100%",maxWidth:480,overflow:"hidden",display:"flex",flexDirection:"column",height:"100%",position:"relative",background:BG}}>

        {/* Glows */}
        <div style={{position:"absolute",top:-80,left:-60,width:280,height:280,borderRadius:"50%",background:"radial-gradient(circle,#6366f144,transparent 70%)",pointerEvents:"none",zIndex:0}}/>
        <div style={{position:"absolute",top:120,right:-80,width:220,height:220,borderRadius:"50%",background:"radial-gradient(circle,#34d39922,transparent 70%)",pointerEvents:"none",zIndex:0}}/>

        {/* Safe area spacer for notch/status bar */}
        <div style={{height:"env(safe-area-inset-top)",flexShrink:0}}/>

        {/* Toast */}
        {toast&&(
          <div onClick={()=>setToast(null)} style={{position:"fixed",bottom:110,left:"50%",transform:"translateX(-50%)",zIndex:999,...G(0.25,30),borderRadius:20,padding:"12px 18px",boxShadow:"0 8px 32px rgba(0,0,0,0.4)",display:"flex",alignItems:"center",gap:10,maxWidth:320,animation:"slideDown 0.3s ease",cursor:"pointer"}}>
            <span style={{fontSize:22}}>{toast.icon}</span>
            <div>
              <div style={{color:"#fff",fontSize:13,fontWeight:700}}>{toast.from}</div>
              <div style={{color:"rgba(255,255,255,0.6)",fontSize:12}}>{toast.text}</div>
            </div>
          </div>
        )}

        {/* Notifications panel */}
        {showNotifs&&(
          <>
            <div style={{position:"fixed",inset:0,zIndex:49}} onClick={()=>setShowNotifs(false)}/>
            <div style={{position:"absolute",top:44,right:12,zIndex:50,...G(0.2,30),borderRadius:20,padding:16,width:280,boxShadow:"0 16px 48px rgba(0,0,0,0.5)"}}>
              <div style={{color:"#fff",fontSize:14,fontWeight:700,marginBottom:12}}>Notifications</div>
              {notifs.length===0&&<div style={{color:"rgba(255,255,255,0.3)",fontSize:13}}>All caught up!</div>}
              {notifs.map(n=>(
                <div key={n.id} style={{display:"flex",gap:10,marginBottom:12,opacity:n.read?.5:1,cursor:"pointer"}} onClick={()=>{setNotifs(ns=>ns.map(x=>x.id===n.id?{...x,read:true}:x));setShowNotifs(false);}}>
                  <span style={{fontSize:22}}>{n.icon}</span>
                  <div>
                    <div style={{color:"rgba(255,255,255,0.9)",fontSize:12,fontWeight:600}}>{n.from}</div>
                    <div style={{color:"rgba(255,255,255,0.4)",fontSize:11,marginTop:1}}>{n.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Body */}
        <div style={{flex:1,overflow:"hidden",position:"relative",zIndex:1,display:"flex",flexDirection:"column"}}>

          {/* ══ WEEK ══════════════════════════════════════════════ */}
          {tab==="week"&&(
            <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
              {/* Header */}
              <div style={{flexShrink:0,padding:"18px 20px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <div style={{color:"rgba(255,255,255,0.88)",fontSize:22,fontWeight:650,letterSpacing:-0.4}}>Home Tasks</div>
                  {myStreak>0&&<div style={{color:"#fbbf24",fontSize:12,marginTop:2}}>🔥 {myStreak}-day streak!</div>}
                  {myStreak===0&&<div style={{color:"rgba(255,255,255,0.2)",fontSize:12,marginTop:2}}>Start your streak today!</div>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <button onClick={()=>setMyFilter(f=>!f)} style={{display:"flex",alignItems:"center",gap:6,background:myFilter?"rgba(255,255,255,0.15)":"rgba(255,255,255,0.07)",border:`1px solid ${myFilter?"rgba(255,255,255,0.35)":"rgba(255,255,255,0.1)"}`,borderRadius:17,padding:"8px 14px 8px 6px",cursor:"pointer",transition:"all 0.2s",boxSizing:"border-box"}}>
                    <Avatar person={me} size={24}/>
                    <span style={{color:myFilter?"rgba(255,255,255,0.9)":"rgba(255,255,255,0.45)",fontSize:12,fontWeight:500}}>Mine</span>
                  </button>
                  <button onClick={()=>{setShowNotifs(v=>!v);setNotifs(ns=>ns.map(n=>({...n,read:true})));}} style={{position:"relative",...G(0.1,20),border:"1px solid rgba(255,255,255,0.1)",borderRadius:"50%",width:34,height:34,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:16}}>
                    🔔
                    {unread>0&&<div style={{position:"absolute",top:4,right:4,width:8,height:8,borderRadius:"50%",background:"#f87171",border:"2px solid #111116"}}/>}
                  </button>
                </div>
              </div>

              {/* Week strip */}
              <div style={{flexShrink:0,margin:"0 0 22px",overflow:"hidden"}}>
                <div ref={stripRef} style={{display:"flex",gap:5,paddingLeft:20,paddingRight:20,overflowX:"auto",WebkitOverflowScrolling:"touch",msOverflowStyle:"none",scrollbarWidth:"none",
                  WebkitMaskImage:"linear-gradient(to right,transparent 0%,black 12%,black 88%,transparent 100%)",
                  maskImage:"linear-gradient(to right,transparent 0%,black 12%,black 88%,transparent 100%)"}}>
                  {visWeek.map(d=>{
                    const dStr=ds(d);
                    const isPast=dStr<todayStr,isToday=dStr===todayStr;
                    const cnt=dayTasks(dStr).length;
                    const doneCnt=dayTasks(dStr).filter(t=>isDone(t,dStr)).length;
                    const active=selDay===dStr,over=dragOver===dStr;
                    const pDay=cnt===0?0:Math.round(doneCnt/cnt*100);
                    const R=13,C=2*Math.PI*R,DA=C*(pDay/100);
                    return (
                      <div key={dStr} onClick={()=>setSelDay(dStr)}
                        onDragOver={e=>{e.preventDefault();setDragOver(dStr);}}
                        onDragLeave={()=>setDragOver(null)}
                        onDrop={()=>{if(dragInfo)moveTask(dragInfo.id,dragInfo.from,dStr);setDragInfo(null);setDragOver(null);}}
                        data-date={dStr}
                        style={{
                          flex:"0 0 46px",borderRadius:18,
                          background:active?"linear-gradient(160deg,#818cf8,#6366f1)":isToday?"rgba(99,102,241,0.14)":"rgba(255,255,255,0.06)",
                          border:active?"1px solid rgba(255,255,255,0.25)":isToday?"2px solid rgba(129,140,248,0.6)":"1px solid rgba(255,255,255,0.06)",
                          boxShadow:active?"0 4px 18px rgba(99,102,241,0.45)":isToday?"0 0 14px rgba(99,102,241,0.2)":"none",
                          padding:"8px 0",cursor:"pointer",
                          display:"flex",flexDirection:"column",alignItems:"center",gap:2,
                          transition:"background 0.15s,border 0.15s,box-shadow 0.15s",
                        }}>
                        <span style={{fontSize:11,fontWeight:500,color:active?"rgba(255,255,255,0.85)":isToday?"#a5b4fc":"rgba(255,255,255,0.38)"}}>
                          {d.toLocaleDateString("en-US",{weekday:"short"})}
                        </span>
                        {isPast&&cnt>0?(
                          <div style={{position:"relative",width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center"}}>
                            <svg width="32" height="32" style={{position:"absolute",top:0,left:0,transform:"rotate(-90deg)"}}>
                              <circle cx="16" cy="16" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5"/>
                              <circle cx="16" cy="16" r={R} fill="none" stroke={active?"rgba(255,255,255,0.9)":pDay===100?"#34d399":"#f87171"} strokeWidth="2.5" strokeDasharray={`${DA} ${C}`} strokeLinecap="round"/>
                            </svg>
                            <span style={{fontSize:12,fontWeight:700,position:"relative",zIndex:1,color:active?"#fff":pDay===100?"#34d399":"rgba(255,255,255,0.55)"}}>{d.getDate()}</span>
                          </div>
                        ):(
                          <span style={{fontSize:17,fontWeight:800,lineHeight:"32px",color:active?"#fff":isToday?"#fff":"rgba(255,255,255,0.6)"}}>{d.getDate()}</span>
                        )}
                        {!isPast&&cnt>0&&<div style={{width:4,height:4,borderRadius:"50%",background:active?"rgba(255,255,255,0.7)":isToday?"#818cf8":"rgba(255,255,255,0.38)"}}/>}
                        {(isPast||(!cnt&&!isToday))&&!(isPast&&cnt>0)&&<div style={{height:4}}/>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Progress */}
              {dayAllTasks.length>0&&(
                <div style={{flexShrink:0,padding:"0 20px 18px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
                    <span style={{color:"rgba(255,255,255,0.4)",fontSize:12}}>{dayLabel(selDay)}</span>
                    <span style={{color:pct===100?"#34d399":"rgba(255,255,255,0.3)",fontSize:11,fontWeight:600}}>
                      {pct===100?"🎉 All done!":`${dayAllDone} of ${dayAllTasks.length}`}
                    </span>
                  </div>
                  <div style={{background:"rgba(255,255,255,0.07)",borderRadius:4,height:3,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct}%`,borderRadius:4,transition:"width 0.4s",background:pct===100?"linear-gradient(90deg,#34d399,#6ee7b7)":"linear-gradient(90deg,#6366f1,#a78bfa)"}}/>
                  </div>
                </div>
              )}

              {/* Filter bar */}
              <div style={{flexShrink:0,padding:"0 20px 18px",display:"flex",gap:8,overflowX:"auto",msOverflowStyle:"none",scrollbarWidth:"none"}}>
                <button onClick={()=>setWeekZoneFilter(null)} style={{
                  flexShrink:0,borderRadius:17,padding:"8px 14px",border:"none",cursor:"pointer",fontSize:13,fontWeight:500,boxSizing:"border-box",
                  background:weekZoneFilter===null?"rgba(255,255,255,0.15)":"rgba(255,255,255,0.06)",
                  color:weekZoneFilter===null?"rgba(255,255,255,0.9)":"rgba(255,255,255,0.4)",
                }}>All</button>
                {zones.filter(z=>dayTasks(selDay).some(t=>t.zone===z.id)).map(z=>(
                  <button key={z.id} onClick={()=>setWeekZoneFilter(weekZoneFilter===z.id?null:z.id)} style={{
                    flexShrink:0,borderRadius:17,padding:"8px 14px",border:"none",cursor:"pointer",fontSize:13,fontWeight:500,boxSizing:"border-box",
                    background:weekZoneFilter===z.id?"rgba(255,255,255,0.15)":"rgba(255,255,255,0.06)",
                    color:weekZoneFilter===z.id?"rgba(255,255,255,0.9)":"rgba(255,255,255,0.4)",
                  }}>{z.label}</button>
                ))}
              </div>

              {/* Task cards */}
              <div style={{flex:1,overflowY:"auto",padding:"0 20px",display:"flex",flexDirection:"column",gap:9,paddingBottom:20}}>
                {selTasks.length===0?(
                  <div style={{textAlign:"center",padding:"40px 0"}}>
                    <div style={{fontSize:44}}>✨</div>
                    <div style={{color:"rgba(255,255,255,0.38)",marginTop:10,fontSize:14}}>No tasks for this day</div>
                  </div>
                ):selTasks.map(t=>{
                  const done=isDone(t,selDay),person=getPerson(t.personId),zone=getZone(t.zone);
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
                        setDragInfo({id:t.id,from:selDay,startX:touch.clientX,startY:touch.clientY});
                      }}
                      onTouchMove={e=>{
                        if(!dragInfo) return;
                        const touch=e.touches[0];
                        const el=document.elementFromPoint(touch.clientX,touch.clientY);
                        const d=el?.closest("[data-date]")?.dataset?.date;
                        if(d) setDragOver(d);
                      }}
                      onTouchEnd={e=>{
                        if(!dragInfo) return;
                        const touch=e.changedTouches[0];
                        const el=document.elementFromPoint(touch.clientX,touch.clientY);
                        const toDate=el?.closest("[data-date]")?.dataset?.date;
                        if(toDate) moveTask(dragInfo.id,dragInfo.from,toDate);
                        setDragInfo(null);setDragOver(null);
                      }}
                      style={{...CARD,padding:"14px 16px",display:"flex",alignItems:"center",gap:12,transition:"opacity 0.2s",cursor:"grab",touchAction:"pan-y",position:"relative",
                        border:"1px solid rgba(255,255,255,0.08)",
                        animation:"fadeInUp 0.2s ease",
}}>
                      {/* Check */}
                      <button onClick={e=>{ if(isFuture) return; e.currentTarget.blur(); toggleDone(t.id,selDay); }} style={{
                        width:28,height:28,borderRadius:"50%",flexShrink:0,
                        border:`2px solid ${done?"#34d399":isFuture?"rgba(255,255,255,0.07)":"rgba(255,255,255,0.2)"}`,
                        background:done?"linear-gradient(135deg,#34d399,#6ee7b7)":"rgba(255,255,255,0.04)",
                        cursor:isFuture?"not-allowed":"pointer",
                        display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s",
                      }}>
                        {done&&<span style={{color:"#fff",fontSize:12,fontWeight:700,display:"inline-block",animation:"checkPop 0.35s ease"}}>✓</span>}
                        {!done&&isFuture&&<span style={{color:"rgba(255,255,255,0.25)",fontSize:11}}>🔒</span>}
                      </button>
                      {/* Text */}
                      <div style={{flex:1,minWidth:0,opacity:done?.4:1,transition:"opacity 0.2s"}}>
                        <div style={{color:"rgba(255,255,255,0.9)",fontSize:15,fontWeight:400,lineHeight:1.3,whiteSpace:"nowrap",overflow:"hidden"}}>{t.text}</div>
                        <div style={{display:"flex",gap:4,marginTop:3,alignItems:"center",flexWrap:"nowrap",overflow:"hidden"}}>
                          {(()=>{
                            const pIds=(t.personIds||[t.personId]).filter(Boolean);
                            if(pIds.length!==1) return <span style={{fontSize:12,color:"rgba(255,255,255,0.5)",background:"rgba(255,255,255,0.07)",borderRadius:20,padding:"2px 8px",whiteSpace:"nowrap",flexShrink:0}}>All</span>;
                            const p=getPerson(pIds[0]);
                            return <span style={{fontSize:12,color:p?.color||"rgba(255,255,255,0.55)",fontWeight:600,whiteSpace:"nowrap",flexShrink:0}}>{p?.name}</span>;
                          })()}
                          <span style={{fontSize:14,color:"rgba(255,255,255,0.32)",flexShrink:0}}>·</span>
                          <span style={{fontSize:12,color:"rgba(255,255,255,0.32)",...(streak>1||t.rescheduledFrom?{maxWidth:80}:{flex:1}),overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"inline-block",verticalAlign:"bottom",flexShrink:1}}>{zone?.label}</span>
                          {streak>1&&<>
                            <span style={{fontSize:13,color:"rgba(255,255,255,0.32)",flexShrink:0}}>·</span>
                            <span style={{fontSize:12,color:"#fbbf24",display:"flex",alignItems:"center",gap:2,whiteSpace:"nowrap",flexShrink:0}}>🔥{streak}</span>
                          </>}
                          {t.rescheduledFrom&&<>
                            <span style={{fontSize:13,color:"rgba(255,255,255,0.32)",flexShrink:0}}>·</span>
                            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{flexShrink:0}}>
                              <path d="M3 5h8m0 0L8.5 2.5M11 5L8.5 7.5" stroke="rgba(251,191,36,0.8)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M13 11H5m0 0l2.5 2.5M5 11l2.5-2.5" stroke="rgba(251,191,36,0.8)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </>}
                        </div>
                      </div>
                      {/* Like */}
                      <button onClick={e=>{e.stopPropagation();likeTask(t.id,selDay);}} style={{
                        position:"relative",
                        background:likeCount>0?"rgba(248,113,113,0.18)":"rgba(248,113,113,0.07)",
                        border:`1px solid ${likeCount>0?"rgba(248,113,113,0.45)":"rgba(248,113,113,0.2)"}`,
                        borderRadius:"50%",width:34,height:34,cursor:"pointer",fontSize:15,
                        display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s",flexShrink:0,
                      }}>
                        <span style={{display:"inline-block",fontSize:15,lineHeight:1,animation:justLiked===(t.id+"|"+selDay)?"heartPop 0.4s ease":"none"}}>{likeCount>0?"❤️":"🤍"}</span>
                        {likeCount>1&&<span style={{position:"absolute",top:-4,right:-4,background:"#f87171",borderRadius:"50%",minWidth:18,height:18,padding:"0 3px",fontSize:11,fontWeight:700,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}>{likeCount}</span>}
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
                          <div onClick={e=>{e.stopPropagation();setAssigneePopover(assigneePopover===t.id?null:t.id);}} style={{opacity:done?.4:1,width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer"}}>
                            <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
                              <circle cx="15.5" cy="8.5" r="4.2" fill="#94a3b8" opacity="0.55"/>
                              <path d="M15.5 14.3c-3.6 0-6.5 2.4-6.9 5.7h13.8c-0.4-3.3-3.3-5.7-6.9-5.7z" fill="#94a3b8" opacity="0.55"/>
                              <circle cx="9" cy="9.5" r="4.8" fill="#94a3b8"/>
                              <path d="M9 15.7c-4.1 0-7.5 2.7-7.9 6.5h15.8c-0.4-3.8-3.8-6.5-7.9-6.5z" fill="#94a3b8"/>
                            </svg>
                          </div>
                        );
                      })()}
                      {assigneePopover===t.id&&(()=>{
                        const pIds=(t.personIds||[t.personId]).filter(Boolean);
                        return (
                          <>
                            <div onClick={e=>{e.stopPropagation();setAssigneePopover(null);}} style={{position:"fixed",inset:0,zIndex:400}}/>
                            <div onClick={e=>e.stopPropagation()} style={{position:"absolute",top:"100%",right:0,marginTop:6,...G(0.2,30),borderRadius:14,padding:"10px 12px",zIndex:401,boxShadow:"0 8px 24px rgba(0,0,0,0.4)",minWidth:120}}>
                              {pIds.map(pid=>{const p=getPerson(pid);return(
                                <div key={pid} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0"}}>
                                  <Avatar person={p} size={20}/>
                                  <span style={{color:"rgba(255,255,255,0.85)",fontSize:12,fontWeight:500}}>{p?.name}</span>
                                </div>
                              );})}
                            </div>
                          </>
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
                <div style={{flexShrink:0,padding:"16px 20px 8px"}}>
                <div style={{color:"rgba(255,255,255,0.9)",fontSize:22,fontWeight:650,letterSpacing:-0.4,marginBottom:16}}>Calendar</div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                  <button onClick={()=>{const d=new Date(calYear,calMonth-1,1);setCalYear(d.getFullYear());setCalMonth(d.getMonth());}} style={{...G(0.1,20),border:"1px solid rgba(255,255,255,0.1)",borderRadius:12,width:36,height:36,cursor:"pointer",color:"rgba(255,255,255,0.6)",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
                  <div style={{color:"rgba(255,255,255,0.85)",fontSize:16,fontWeight:700}}>{mName}</div>
                  <button onClick={()=>{const d=new Date(calYear,calMonth+1,1);setCalYear(d.getFullYear());setCalMonth(d.getMonth());}} style={{...G(0.1,20),border:"1px solid rgba(255,255,255,0.1)",borderRadius:12,width:36,height:36,cursor:"pointer",color:"rgba(255,255,255,0.6)",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
                </div>
                </div>
                <div style={{flex:1,overflowY:"auto",padding:"0 20px 20px",WebkitMaskImage:"linear-gradient(to bottom,black 0%,black 100%)",maskImage:"linear-gradient(to bottom,black 0%,black 100%)"}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:6}}>
                  {["Mo","Tu","We","Th","Fr","Sa","Su"].map(d=><div key={d} style={{textAlign:"center",color:"rgba(255,255,255,0.38)",fontSize:11,fontWeight:700}}>{d}</div>)}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:14}}>
                  {cells.map((d,i)=>{
                    if(!d) return <div key={"e"+i}/>;
                    const dStr=ds(d),cnt=dayTasks(dStr).length;
                    const dCnt=dayTasks(dStr).filter(t=>isDone(t,dStr)).length;
                    const isT=dStr===todayStr,iP=dStr<todayStr,iS=selDay===dStr;
                    const allD=cnt>0&&dCnt===cnt,hasMiss=iP&&cnt>0&&dCnt<cnt;
                    return (
                      <div key={dStr} onClick={()=>setSelDay(dStr)} style={{borderRadius:12,padding:"7px 2px",display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:"pointer",transition:"all 0.15s",
                        background:iS?"linear-gradient(135deg,#6366f1,#8b5cf6)":isT?"rgba(99,102,241,0.18)":"rgba(255,255,255,0.04)",
                        border:iS?"1px solid rgba(255,255,255,0.2)":isT?"1px solid rgba(99,102,241,0.4)":"1px solid transparent",
                        boxShadow:iS?"0 4px 16px rgba(99,102,241,0.35)":"none"}}>
                        <span style={{fontSize:13,fontWeight:iS||isT?700:400,color:iS?"#fff":isT?"#818cf8":iP?"rgba(255,255,255,0.38)":"rgba(255,255,255,0.7)"}}>{d.getDate()}</span>
                        {cnt>0&&<div style={{width:6,height:6,borderRadius:"50%",background:iS?"rgba(255,255,255,0.8)":allD?"#34d399":hasMiss?"#f87171":"#6366f1"}}/>}
                      </div>
                    );
                  })}
                </div>
                <div style={{display:"flex",gap:14,marginBottom:14,justifyContent:"center"}}>
                  {[["#34d399","All done"],["#f87171","Missed"],["#6366f1","Planned"]].map(([c,l])=>(
                    <div key={l} style={{display:"flex",alignItems:"center",gap:5}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:c}}/>
                      <span style={{color:"rgba(255,255,255,0.38)",fontSize:11}}>{l}</span>
                    </div>
                  ))}
                </div>
                <div style={{...CARD}}>
                  <div style={{marginBottom:10}}><span style={{color:"rgba(255,255,255,0.5)",fontSize:12}}>{dayLabel(selDay)}</span></div>
                  {sTotal>0&&(sPast||sToday)&&(
                    <div style={{marginBottom:10}}>
                      <div style={{background:"rgba(255,255,255,0.06)",borderRadius:4,height:4,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${sPct}%`,borderRadius:4,transition:"width 0.4s ease",background:sPct===100?"linear-gradient(90deg,#34d399,#6ee7b7)":sPast?"linear-gradient(90deg,#f87171,#fca5a5)":"linear-gradient(90deg,#6366f1,#a78bfa)"}}/>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",marginTop:5}}>
                        <span style={{color:"#34d399",fontSize:11}}>✓ {sDone} done</span>
                        {sPast&&sDayTasks.filter(t=>!isDone(t,selDay)).length>0&&<span style={{color:"#f87171",fontSize:11}}>✗ {sDayTasks.filter(t=>!isDone(t,selDay)).length} missed</span>}
                      </div>
                    </div>
                  )}
                  {sDayTasks.length===0?<div style={{color:"rgba(255,255,255,0.2)",fontSize:13,textAlign:"center",padding:"10px 0"}}>No tasks</div>
                  :sDayTasks.map(t=>{
                    const done=isDone(t,selDay),missed=sPast&&!done,isFutureDay=selDay>todayStr,person=getPerson(t.personId),zone=getZone(t.zone);
                    return (
                      <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                        <button onClick={()=>{if(isFutureDay)return;toggleDone(t.id,selDay);}} style={{width:22,height:22,borderRadius:"50%",flexShrink:0,border:`2px solid ${done?"#34d399":missed?"rgba(248,113,113,0.5)":isFutureDay?"rgba(255,255,255,0.08)":"rgba(255,255,255,0.15)"}`,background:done?"#34d399":missed?"rgba(248,113,113,0.1)":"transparent",cursor:isFutureDay?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                          {done&&<span style={{color:"#fff",fontSize:11,fontWeight:700}}>✓</span>}
                          {missed&&<span style={{color:"rgba(248,113,113,0.7)",fontSize:11,fontWeight:700}}>✕</span>}
                          {!done&&!missed&&isFutureDay&&<span style={{color:"rgba(255,255,255,0.25)",fontSize:11}}>🔒</span>}
                        </button>
                        <div style={{flex:1}}>
                          <div style={{color:done?"rgba(255,255,255,0.38)":missed?"rgba(248,113,113,0.6)":"rgba(255,255,255,0.82)",fontSize:13}}>{t.text}</div>
                          <div style={{color:"rgba(255,255,255,0.38)",fontSize:11,marginTop:1}}>{zone?.label}</div>
                        </div>
                        <Avatar person={person} size={22}/>
                      </div>
                    );
                  })}
                </div>
              </div>
                </div>
            );
          })()}

          {/* ══ ADD TASK ══════════════════════════════════════════ */}
          {tab==="add"&&(
            <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
              <div style={{flexShrink:0,padding:"16px 20px 8px",color:"rgba(255,255,255,0.88)",fontSize:22,fontWeight:650,letterSpacing:-0.4}}>{editTaskId?"Edit Task":"New Task"}</div>
              <div style={{flex:1,overflowY:"auto",padding:"8px 20px 20px",WebkitMaskImage:"linear-gradient(to bottom,black 0%,black 100%)",maskImage:"linear-gradient(to bottom,black 0%,black 100%)"}}>
              <div style={{display:"flex",flexDirection:"column",gap:22}}>
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:8}}>
                    <span style={labelSt}>What to do</span>
                    <span style={{fontSize:11,color:form.text.length>=form.maxLen?"#f87171":form.text.length>form.maxLen*0.8?"#fbbf24":"rgba(255,255,255,0.3)"}}>{form.text.length}/{form.maxLen}</span>
                  </div>
                  <input ref={taskNameRef} type="text" maxLength={form.maxLen} value={form.text} onChange={e=>{setForm(f=>({...f,text:e.target.value.slice(0,f.maxLen)}));if(e.target.value.trim())setTaskNameError(false);}} placeholder="e.g. wash the sink" style={{...inputSt,border:taskNameError?"2px solid #f87171":"2px solid rgba(255,255,255,0.1)"}}/></div>
                <div>
                  <span style={labelSt}>Zone</span>
                  <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                    {zones.map(z=><button key={z.id} onClick={()=>setForm(f=>({...f,zone:z.id}))} style={{display:"flex",alignItems:"center",gap:6,background:form.zone===z.id?"rgba(255,255,255,0.14)":"rgba(255,255,255,0.05)",border:`1px solid ${form.zone===z.id?"rgba(255,255,255,0.3)":"rgba(255,255,255,0.08)"}`,borderRadius:12,padding:"8px 14px",cursor:"pointer",color:form.zone===z.id?"#fff":"rgba(255,255,255,0.4)",fontSize:13}}>{z.emoji} {z.label}</button>)}
                  </div>
                </div>
                <div>
                  <span style={labelSt}>Frequency</span>
                  <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                    {FREQ_OPTIONS.map(f=><button key={f.id} onClick={()=>setForm(fm=>({...fm,freq:f.id}))} style={{background:form.freq===f.id?FREQ_COLOR[f.id]+"25":"rgba(255,255,255,0.05)",border:`1px solid ${form.freq===f.id?FREQ_COLOR[f.id]+"60":"rgba(255,255,255,0.08)"}`,borderRadius:12,padding:"8px 14px",cursor:"pointer",color:form.freq===f.id?FREQ_COLOR[f.id]:"rgba(255,255,255,0.4)",fontSize:13,fontWeight:500}}>{f.label}</button>)}
                  </div>
                  {form.freq==="custom"&&(
                    <div style={{display:"flex",alignItems:"center",gap:10,...G(0.08,20),borderRadius:14,padding:"12px 16px",marginTop:8,border:"1px solid rgba(232,121,249,0.3)"}}>
                      <span style={{color:"rgba(255,255,255,0.5)",fontSize:14}}>Every</span>
                      <input type="number" min="1" max="365" value={form.customDays===0?"":form.customDays} onChange={e=>{const v=e.target.value;setForm(f=>({...f,customDays:v===""?0:Math.max(1,parseInt(v)||1)}));}} onBlur={e=>{if(!form.customDays||form.customDays<1)setForm(f=>({...f,customDays:2}));}} style={{background:"rgba(255,255,255,0.9)",borderRadius:10,border:"none",padding:"6px 10px",color:"#111",fontWeight:700,fontSize:16,width:60,textAlign:"center"}}/>
                      <span style={{color:"rgba(255,255,255,0.5)",fontSize:14}}>days</span>
                    </div>
                  )}
                </div>

                <div>
                  <span style={labelSt}>Start date</span>
                  <input type="date" value={form.startDate} min={todayStr}
                    onChange={e=>setForm(f=>({...f,startDate:e.target.value}))}
                    style={{...inputSt,background:"rgba(255,255,255,0.9)",color:"#111",colorScheme:"light"}}/>
                </div>
                <div>
                  <span style={labelSt}>Assigned to</span>
                  <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}}>
                    <button onClick={()=>setForm(f=>({...f,personIds:people.map(p=>p.id)}))} style={{
                      display:"flex",alignItems:"center",height:38,boxSizing:"border-box",
                      background:(form.personIds||[]).length===people.length?"rgba(255,255,255,0.15)":"rgba(255,255,255,0.05)",
                      border:`2px solid ${(form.personIds||[]).length===people.length?"rgba(255,255,255,0.4)":"rgba(255,255,255,0.08)"}`,
                      borderRadius:20,padding:"0 16px",cursor:"pointer",
                    }}>
                      <span style={{color:(form.personIds||[]).length===people.length?"rgba(255,255,255,0.9)":"rgba(255,255,255,0.4)",fontSize:13,fontWeight:500}}>All</span>
                    </button>
                    {people.map(p=>{
                      const sel=(form.personIds||[]).length===1&&(form.personIds||[]).includes(p.id);
                      return <button key={p.id} onClick={()=>setForm(f=>({...f,personIds:[p.id]}))} style={{display:"flex",alignItems:"center",gap:7,height:38,boxSizing:"border-box",background:sel?p.color+"28":"rgba(255,255,255,0.05)",border:`2px solid ${sel?p.color+"90":"rgba(255,255,255,0.08)"}`,borderRadius:20,padding:"0 14px 0 6px",cursor:"pointer",position:"relative"}}>
                        <Avatar person={p} size={22}/>
                        <span style={{color:sel?p.color:"rgba(255,255,255,0.45)",fontSize:13,fontWeight:500}}>{p.name}</span>
                      </button>;
                    })}
                  </div>
                </div>
                <button onClick={saveTask} style={{background:"linear-gradient(135deg,#6366f1,#8b5cf6)",border:"none",borderRadius:16,padding:"14px",color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 20px rgba(99,102,241,0.4)",marginTop:4}}>{editTaskId?"Save Changes":"Add Task"}</button>
                <button onClick={()=>{setForm(blankForm);setEditTaskId(null);setTab(returnTab);}} style={{background:"none",border:"none",color:"rgba(255,255,255,0.3)",fontSize:14,cursor:"pointer",padding:"6px"}}>Cancel</button>
              </div>
              </div>
            </div>
          )}

          {/* ══ ALL TASKS ══════════════════════════════════════════ */}
          {tab==="tasks"&&(
            <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
              <div style={{flexShrink:0,padding:"16px 20px 8px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <div style={{color:"rgba(255,255,255,0.88)",fontSize:22,fontWeight:650,letterSpacing:-0.4}}>All Tasks</div>
                <div style={{display:"flex",gap:12,alignItems:"center"}}>
                  <button onClick={()=>setShowStats(true)} style={{background:"rgba(251,191,36,0.12)",border:"1px solid rgba(251,191,36,0.3)",borderRadius:12,padding:"8px 14px",color:"#fbbf24",fontSize:13,fontWeight:500,cursor:"pointer"}}>🏆 Stats</button>
                  <button onClick={()=>{setTaskNameError(false);setAssigneeError(false);setReturnTab(tab);setEditTaskId(null);setForm(blankForm);setTab("add");}} style={{background:"none",border:"none",color:"#818cf8",fontSize:14,fontWeight:600,cursor:"pointer",padding:0}}>＋ Add</button>
                </div>
              </div>
              </div>
              <div style={{flex:1,overflowY:"auto",padding:"0 20px 20px",WebkitMaskImage:"linear-gradient(to bottom,black 0%,black 100%)",maskImage:"linear-gradient(to bottom,black 0%,black 100%)"}}>
              {groupedZones.map(zone=>(
                <div key={zone.id} style={{marginBottom:22}}>
                  <div style={{color:"rgba(255,255,255,0.85)",fontSize:16,fontWeight:700,marginBottom:9}}>{zone.emoji} {zone.label}</div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {zone.tasks.map(t=>{
                      const pIds=(t.personIds||[t.personId]).filter(Boolean),open=expandId===t.id,streak=computeStreak(t);
                      return (
                        <div key={t.id} style={{...CARD,cursor:"pointer",overflow:"hidden"}} onClick={()=>setExpandId(open?null:t.id)}>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
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
                              <div style={{color:"rgba(255,255,255,0.9)",fontSize:15,fontWeight:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%"}}>{t.text}</div>
                              <div style={{display:"flex",gap:6,marginTop:2,alignItems:"center"}}>
                                <span style={{color:FREQ_COLOR[t.freq]||"#94a3b8",fontSize:11}}>{FREQ_OPTIONS.find(f=>f.id===t.freq)?.label}</span>
                              </div>
                            </div>
                            <span style={{color:"rgba(255,255,255,0.18)",fontSize:11,display:"inline-block",transition:"transform 0.2s",transform:open?"rotate(180deg)":"none"}}>▼</span>
                          </div>
                          {open&&(
                            <div onClick={e=>e.stopPropagation()} style={{marginTop:12,paddingTop:12,borderTop:"1px solid rgba(255,255,255,0.07)"}}>
                              <span style={labelSt}>Assigned to</span>
                              <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:10}}>
                                <button onClick={()=>{const upd={personIds:people.map(p=>p.id),personId:people[0]?.id??null};setTasks(ts=>ts.map(x=>x.id!==t.id?x:{...x,...upd}));persistTask(t.id,upd);}} style={{
                                  display:"flex",alignItems:"center",height:36,boxSizing:"border-box",
                                  background:(t.personIds||[t.personId]).filter(Boolean).length===people.length?"rgba(255,255,255,0.15)":"rgba(255,255,255,0.05)",
                                  border:`2px solid ${(t.personIds||[t.personId]).filter(Boolean).length===people.length?"rgba(255,255,255,0.4)":"rgba(255,255,255,0.08)"}`,
                                  borderRadius:20,padding:"0 14px",cursor:"pointer",
                                }}>
                                  <span style={{color:(t.personIds||[t.personId]).filter(Boolean).length===people.length?"rgba(255,255,255,0.9)":"rgba(255,255,255,0.4)",fontSize:12,fontWeight:500}}>All</span>
                                </button>
                                {people.map(p=>{
                                  const pIds=t.personIds||[t.personId].filter(Boolean);
                                  const sel=pIds.length===1&&pIds.includes(p.id);
                                  return <button key={p.id} onClick={()=>{const upd={personIds:[p.id],personId:p.id};setTasks(ts=>ts.map(x=>x.id!==t.id?x:{...x,...upd}));persistTask(t.id,upd);}} style={{display:"flex",alignItems:"center",gap:7,height:36,boxSizing:"border-box",background:sel?p.color+"28":"rgba(255,255,255,0.05)",border:`2px solid ${sel?p.color+"90":"rgba(255,255,255,0.08)"}`,borderRadius:20,padding:"0 12px 0 6px",cursor:"pointer",position:"relative"}}>
                                    <Avatar person={p} size={20}/>
                                    <span style={{color:sel?p.color:"rgba(255,255,255,0.45)",fontSize:12,fontWeight:500}}>{p.name}</span>
                                  </button>;
                                })}
                              </div>
                              <div style={{display:"flex",gap:8}}>
                                <button onClick={()=>{setTaskNameError(false);setReturnTab(tab);setEditTaskId(t.id);setForm({zone:t.zone,text:t.text,freq:t.freq,personIds:t.personIds||[t.personId].filter(Boolean),customDays:4,startDate:todayStr,maxLen:22});setExpandId(null);setTab("add");}} style={{flex:1,background:"rgba(255,255,255,0.06)",border:"none",borderRadius:12,padding:"9px",color:"rgba(255,255,255,0.55)",fontSize:12,fontWeight:600,cursor:"pointer"}}>Edit</button>
                                <button onClick={()=>{setTasks(ts=>ts.filter(x=>x.id!==t.id));deleteTaskRemote(t.id);setExpandId(null);}} style={{flex:1,background:"rgba(248,113,113,0.1)",border:"none",borderRadius:12,padding:"9px",color:"#f87171",fontSize:12,fontWeight:600,cursor:"pointer"}}>Delete</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              </div>
            </div>
          )}

          {/* ══ SETTINGS ══════════════════════════════════════════ */}
          {tab==="settings"&&(
            <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
              <div style={{flexShrink:0,padding:"16px 20px 8px",color:"rgba(255,255,255,0.88)",fontSize:22,fontWeight:650,letterSpacing:-0.4}}>Settings</div>
              <div style={{flex:1,overflowY:"auto",padding:"8px 20px 20px",WebkitMaskImage:"linear-gradient(to bottom,black 0%,black 100%)",maskImage:"linear-gradient(to bottom,black 0%,black 100%)"}}>
              {myStreak>0&&(
                <div style={{marginBottom:22,display:"flex",alignItems:"center",gap:12}}>
                  <span style={{fontSize:28}}>🔥</span>
                  <div>
                    <div style={{color:"#fbbf24",fontSize:16,fontWeight:700}}>{myStreak}-day streak!</div>
                    <div style={{color:"rgba(255,255,255,0.35)",fontSize:12,marginTop:2}}>Keep it up, {me?.name}!</div>
                  </div>
                </div>
              )}
              {/* Zones */}
              <div style={{marginBottom:26}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <span style={{color:"rgba(255,255,255,0.85)",fontSize:16,fontWeight:700}}>Zones</span>
                  <button onClick={()=>{setZoneNameError(false);setZForm({label:"",emoji:"🏠"});setZoneModal({mode:"new"});setEmojiPicker(false);}} style={{background:"none",border:"none",color:"#818cf8",fontSize:13,fontWeight:500,cursor:"pointer",padding:0}}>＋ Add</button>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:7}}>
                  {zones.map(z=>(
                    <div key={z.id} onClick={()=>{setZoneNameError(false);setZForm({label:z.label,emoji:z.emoji});setZoneModal({mode:"edit",id:z.id});setEmojiPicker(false);}} style={{...CARD,display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
                      <div style={{width:38,height:38,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{z.emoji}</div>
                      <span style={{flex:1,color:"rgba(255,255,255,0.82)",fontSize:14,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}>{z.label}</span>
                      <span style={{color:"rgba(255,255,255,0.2)",fontSize:17}}>›</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* People */}
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <span style={{color:"rgba(255,255,255,0.85)",fontSize:16,fontWeight:700}}>People</span>
                  <button onClick={()=>{setPersonNameError(false);setPForm({name:"",color:PALETTE[0],avatarEmoji:""});setAvatarPicker(false);setPersonModal({mode:"new"});}} style={{background:"none",border:"none",color:"#818cf8",fontSize:13,fontWeight:500,cursor:"pointer",padding:0}}>＋ Add</button>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:7}}>
                  {people.map(p=>{
                    const count=tasks.filter(t=>t.personId===p.id).length;
                    return (
                      <div key={p.id} onClick={()=>{setPersonNameError(false);setPForm({name:p.name,color:p.color,avatarEmoji:p.avatarEmoji||""});setAvatarPicker(false);setPersonModal({mode:"edit",id:p.id});}} style={{...CARD,display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
                        <Avatar person={p} size={40}/>
                        <div style={{flex:1}}>
                          <div style={{color:"rgba(255,255,255,0.88)",fontSize:15,fontWeight:600,display:"flex",alignItems:"center",gap:7}}>
                            {p.name}
                            {meId===p.id&&<span style={{fontSize:11,color:"#818cf8",background:"rgba(129,140,248,0.15)",border:"1px solid rgba(129,140,248,0.3)",borderRadius:6,padding:"3px 6px"}}>me</span>}
                          </div>
                          <div style={{color:"rgba(255,255,255,0.38)",fontSize:11,marginTop:1}}>{count} task{count!==1?"s":""}</div>
                        </div>
                        <span style={{color:"rgba(255,255,255,0.2)",fontSize:17}}>›</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Invite / account */}
              <div style={{marginTop:26}}>
                <div style={{color:"rgba(255,255,255,0.85)",fontSize:16,fontWeight:700,marginBottom:10}}>Invite code</div>
                <div style={{...CARD,display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <span style={{color:"rgba(255,255,255,0.85)",fontSize:18,fontWeight:700,letterSpacing:2}}>{household.invite_code}</span>
                  <button onClick={()=>navigator.clipboard?.writeText(household.invite_code)} style={{background:"rgba(129,140,248,0.15)",border:"1px solid rgba(129,140,248,0.3)",borderRadius:10,padding:"7px 12px",color:"#818cf8",fontSize:12,fontWeight:600,cursor:"pointer"}}>Copy</button>
                </div>
                <div style={{color:"rgba(255,255,255,0.3)",fontSize:11,marginBottom:20}}>Share this code so your partner can join this home</div>
                <button onClick={onSignOut} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:14,padding:"12px",color:"rgba(255,255,255,0.5)",fontSize:13,fontWeight:600,cursor:"pointer",width:"100%"}}>Sign out</button>
              </div>
              </div>
            </div>
          )}

        </div>{/* end body */}

        {/* ── TAB BAR ───────────────────────────────────────────── */}
        <div style={{flexShrink:0,zIndex:10,...G(0.14,40),borderTop:"1px solid rgba(255,255,255,0.08)",padding:"6px 14px",display:"flex",gap:3}}>
          {TABS.map(item=>{
            const active=tab===item.id;
            if(item.accent) return (
              <div key={item.id} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
                <button onClick={()=>{setTaskNameError(false);setAssigneeError(false);setReturnTab(tab);setEditTaskId(null);setForm(blankForm);setTab("add");}} style={{width:52,height:52,borderRadius:"50%",border:"none",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",boxShadow:"0 6px 22px rgba(99,102,241,0.5),inset 0 1px 0 rgba(255,255,255,0.25)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",marginTop:-18}}><svg width="22" height="22" viewBox="0 0 22 22" fill="none"><line x1="11" y1="2" x2="11" y2="20" stroke="white" strokeWidth="2.5" strokeLinecap="round"/><line x1="2" y1="11" x2="20" y2="11" stroke="white" strokeWidth="2.5" strokeLinecap="round"/></svg></button>
              </div>
            );
            return (
              <button key={item.id} onClick={()=>setTab(item.id)} style={{flex:1,border:"none",borderRadius:16,padding:"5px 0",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,background:active?"rgba(255,255,255,0.1)":"transparent",transition:"all 0.15s"}}>
                <span style={{fontSize:20,lineHeight:1}}>{item.emoji}</span>
                <span style={{fontSize:11,fontWeight:700,letterSpacing:0.2,color:active?"rgba(255,255,255,0.88)":"rgba(255,255,255,0.3)"}}>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── STATS MODAL ───────────────────────────────────────── */}

        {showStats&&(
          <div style={{position:"absolute",inset:0,zIndex:300,display:"flex",alignItems:"flex-end",background:"rgba(0,0,0,0.6)",backdropFilter:"blur(8px)"}} onClick={()=>setShowStats(false)}>
            <div onClick={e=>e.stopPropagation()} style={{width:"100%",background:"linear-gradient(160deg,#1a1035,#0d2040)",borderRadius:"28px 28px 0 0",maxHeight:"85%",display:"flex",flexDirection:"column",boxShadow:"0 -20px 60px rgba(0,0,0,0.6)",border:"1px solid rgba(255,255,255,0.1)"}}>
              {/* Sticky header */}
              <div style={{flexShrink:0,padding:"16px 20px 12px",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
                <div style={{width:36,height:4,background:"rgba(255,255,255,0.38)",borderRadius:2,margin:"0 auto 14px"}}/>
                <div style={{color:"rgba(255,255,255,0.9)",fontSize:20,fontWeight:650}}>🏆 Stats</div>
              </div>
              {/* Scrollable content */}
              <div style={{flex:1,overflowY:"auto",padding:"16px 20px 40px"}}>
              {(()=>{
                const weekDates=Array.from({length:7},(_,i)=>{const d=new Date(TODAY);d.setDate(TODAY.getDate()-((TODAY.getDay()+6)%7)+i);return ds(d);});
                const mvp=getWeeklyMVP(tasks,people,weekDates);
                const dreamTeam=getDreamTeam(tasks,people,weekDates);
                const DIV=<div style={{height:1,background:"rgba(255,255,255,0.07)",margin:"24px 0"}}/>;
                const SL=t=><div style={{color:"rgba(255,255,255,0.85)",fontSize:16,fontWeight:700,marginBottom:14,marginTop:8}}>{t}</div>;
                return(<>

                  {/* Weekly summary */}
                  <div style={{marginBottom:12}}>
                    {SL("This week")}
                    {mvp&&<div style={{...G(0.12,20),borderRadius:14,padding:"9px 15px",marginBottom:12,display:"flex",alignItems:"center",gap:8,border:"1px solid rgba(251,191,36,0.3)"}}>
                      <span style={{fontSize:20}}>⭐</span>
                      <span style={{color:"#fbbf24",fontSize:13,fontWeight:500}}>MVP: {mvp.name}</span>
                    </div>}
                    {dreamTeam&&<div style={{...G(0.12,20),borderRadius:14,padding:"9px 15px",marginBottom:12,display:"flex",alignItems:"center",gap:8,border:"1px solid rgba(52,211,153,0.3)"}}>
                      <span style={{fontSize:20}}>🤝</span>
                      <span style={{color:"#34d399",fontSize:13,fontWeight:500}}>Dream Team — everyone contributed!</span>
                    </div>}
                    {people.map(p=>{
                      const ws=getWeekStats(tasks,p.id,weekDates);
                      const rank=getRank(computePts(tasks,p.id));
                      const streak=myStreak; // approximate
                      return(
                        <div key={p.id} style={{marginBottom:14}}>
                          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                            <Avatar person={p} size={32}/>
                            <div style={{flex:1}}>
                              <div style={{color:"rgba(255,255,255,0.88)",fontSize:14,fontWeight:600}}>{p.name}</div>
                              <div style={{color:rank.color,fontSize:11}}>{rank.label} · {computePts(tasks,p.id)} pts</div>
                            </div>
                            <div style={{textAlign:"right"}}>
                              <div style={{color:"rgba(255,255,255,0.88)",fontSize:15,fontWeight:700}}>{ws.done}<span style={{color:"rgba(255,255,255,0.3)",fontSize:11}}>/{ws.total}</span></div>
                              <div style={{color:ws.pct>=80?"#34d399":ws.pct>=50?"#fbbf24":"#f87171",fontSize:11,fontWeight:600}}>{ws.pct}%</div>
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
                  <div style={{marginBottom:12}}>
                    {SL("Leaderboard")}
                    {[...people].sort((a,b)=>computePts(tasks,b.id)-computePts(tasks,a.id)).map((p,i)=>{
                      const pts=computePts(tasks,p.id);
                      const rank=getRank(pts);
                      return(
                        <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,padding:"4px 0"}}>
                          <span style={{fontSize:22,width:26,textAlign:"center"}}>{["🥇","🥈","🥉"][i]||"·"}</span>
                          <Avatar person={p} size={36}/>
                          <div style={{flex:1}}>
                            <div style={{color:"rgba(255,255,255,0.88)",fontSize:14,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
                              {p.name}
                              {meId===p.id&&<span style={{fontSize:11,color:"#818cf8",background:"rgba(129,140,248,0.15)",borderRadius:4,padding:"2px 5px"}}>me</span>}
                            </div>
                            <div style={{color:rank.color,fontSize:12,marginTop:1}}>{rank.label}</div>
                          </div>
                          <div style={{color:"rgba(255,255,255,0.88)",fontSize:15,fontWeight:700}}>{pts}<span style={{color:"rgba(255,255,255,0.3)",fontSize:11}}> pts</span></div>
                        </div>
                      );
                    })}
                  </div>
                  {DIV}
                  {/* Streak milestones */}
                  <div style={{marginBottom:12}}>
                    {SL("Streaks")}
                    {people.map((p,pi)=>{
                      const pStreak=(()=>{let s=0;for(let i=1;i<=90;i++){const d=new Date(TODAY);d.setDate(TODAY.getDate()-i);const dStr=ds(d);const myT=tasks.filter(t=>(t.personIds||[t.personId]).includes(p.id)&&t.scheduledDates.includes(dStr));if(myT.length===0)continue;if(myT.every(t=>t.doneOn.includes(dStr)))s++;else break;}return s;})();
                      const earned=getStreakMilestones(pStreak);
                      const next=STREAK_MILESTONES.find(m=>pStreak<m.days);
                      return(
                        <div key={p.id} style={{marginBottom:pi<people.length-1?24:0}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              <Avatar person={p} size={26}/>
                              <span style={{color:"rgba(255,255,255,0.85)",fontSize:14,fontWeight:600}}>{p.name}</span>
                            </div>
                            <span style={{color:pStreak>0?"#fbbf24":"rgba(255,255,255,0.3)",fontSize:14,fontWeight:700}}>
                              {pStreak>0?`🔥 ${pStreak} days`:"No streak yet"}
                            </span>
                          </div>
                          {earned.length>0&&(
                            <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:10}}>
                              {earned.map(m=>(
                                <span key={m.days} style={{
                                  display:"inline-flex",alignItems:"center",
                                  color:"rgba(255,255,255,0.75)",
                                  background:"rgba(255,255,255,0.08)",
                                  border:"1px solid rgba(255,255,255,0.12)",
                                  borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:500,lineHeight:1,
                                }}>{m.icon} {m.label}</span>
                              ))}
                            </div>
                          )}
                          {next?(
                            <div style={{color:"rgba(255,255,255,0.3)",fontSize:12,marginTop:2}}>
                              {next.days-pStreak} more days to unlock {next.label}
                            </div>
                          ):(
                            <div style={{color:"#e879f9",fontSize:12}}>All streak badges unlocked!</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {DIV}
                  {/* Zone achievements */}
                  <div style={{marginBottom:4}}>
                    {SL("Zone achievements")}
                    {people.map(p=>{
                      const achs=getZoneAch(tasks,p.id);
                      const LEVELS=[{icon:"🥉",min:10,color:"#fb923c"},{icon:"🥈",min:50,color:"#94a3b8"},{icon:"🥇",min:100,color:"#fbbf24"}];
                      return(
                        <div key={p.id} style={{marginBottom:20}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                            <Avatar person={p} size={22}/>
                            <span style={{color:"rgba(255,255,255,0.7)",fontSize:13,fontWeight:600}}>{p.name}</span>
                          </div>
                          {achs.length===0
                            ?<div style={{color:"rgba(255,255,255,0.3)",fontSize:12}}>Complete 10 tasks in any zone to unlock Bronze</div>
                            :<div style={{display:"flex",flexDirection:"column",gap:8}}>
                              {achs.map(a=>(
                                <div key={a.zone} style={{
                                  background:"rgba(255,255,255,0.05)",
                                  border:"1px solid rgba(255,255,255,0.08)",
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

                </>);
              })()}
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
            <div style={{width:"100%",maxWidth:375,background:"linear-gradient(160deg,#1a1035,#0d2040)",borderRadius:"28px 28px 0 0",padding:"36px 28px 52px",textAlign:"center",animation:"celebUp 0.5s cubic-bezier(0.34,1.4,0.64,1) forwards",boxShadow:"0 -20px 60px rgba(0,0,0,0.6)",border:"1px solid rgba(255,255,255,0.1)"}}>
              <div style={{fontSize:80,marginBottom:14,display:"inline-block",animation:"pulseBig 1s ease infinite"}}>{celebration.emoji}</div>
              <div style={{color:"#fff",fontSize:26,fontWeight:800,letterSpacing:-0.5,marginBottom:8}}>{celebration.title}</div>
              <div style={{color:"rgba(255,255,255,0.45)",fontSize:15,marginBottom:20}}>{celebration.subtitle}</div>
              <div style={{color:"rgba(255,255,255,0.2)",fontSize:12}}>Tap to close</div>
            </div>
          </div>
        )}

        {/* ── PERSON MODAL ──────────────────────────────────────── */}
        {personModal&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200}} onClick={()=>{setPersonModal(null);setAvatarPicker(false);}}>
            <div onClick={e=>e.stopPropagation()} style={{width:375,...G(0.18,40),borderRadius:"30px 30px 0 0",padding:"22px 22px 42px",display:"flex",flexDirection:"column",gap:16,boxShadow:"0 -20px 60px rgba(0,0,0,0.5)"}}>
              <div style={{width:34,height:4,background:"rgba(255,255,255,0.18)",borderRadius:2,margin:"0 auto"}}/>
              <div style={{color:"#fff",fontSize:18,fontWeight:700}}>{personModal.mode==="new"?"New Person":"Edit Person"}</div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
                <div style={{position:"relative",cursor:"pointer"}} onClick={()=>setAvatarPicker(v=>!v)}>
                  <Avatar person={{name:pForm.name||"?",color:pForm.color,avatarEmoji:pForm.avatarEmoji}} size={72}/>
                </div>
              </div>
              {avatarPicker&&(
                <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:250}} onClick={()=>setAvatarPicker(false)}>
                  <div onClick={e=>e.stopPropagation()} style={{width:320,background:"#26262c",borderRadius:20,padding:18,boxShadow:"0 20px 60px rgba(0,0,0,0.6)",border:"1px solid rgba(255,255,255,0.12)"}}>
                    <div style={{color:"rgba(255,255,255,0.85)",fontSize:15,fontWeight:600,marginBottom:12}}>Choose avatar</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                      <div style={{position:"relative",display:"inline-block"}}><input maxLength={2} placeholder="Aa" value={pForm.avatarEmoji&&!AVATAR_EMOJIS.includes(pForm.avatarEmoji)?pForm.avatarEmoji:""} onChange={e=>{const v=e.target.value.toUpperCase();setPForm(f=>({...f,avatarEmoji:v}));if(v)setAvatarPicker(false);}} style={{width:38,height:38,borderRadius:10,background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.2)",color:"#fff",fontSize:14,fontWeight:700,textAlign:"center",cursor:"text",fontFamily:"inherit",outline:"none"}}/></div>
                      {AVATAR_EMOJIS.map(e=>(
                        <button key={e} onClick={()=>{setPForm(f=>({...f,avatarEmoji:e}));setAvatarPicker(false);}} style={{background:pForm.avatarEmoji===e?"rgba(255,255,255,0.2)":"transparent",border:"none",borderRadius:10,width:38,height:38,fontSize:22,cursor:"pointer"}}>{e}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div>
                <span style={labelSt}>NAME</span>
                <input value={pForm.name} onChange={e=>{setPForm(f=>({...f,name:e.target.value}));if(e.target.value.trim())setPersonNameError(false);}} placeholder="Name" style={{...inputSt,background:"rgba(255,255,255,0.9)",color:"#111",border:personNameError?"2px solid #f87171":"2px solid rgba(255,255,255,0.1)"}}/>
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
              <button onClick={()=>{ if(personModal.mode==="new"){ setPForm(f=>({...f,_tempMe:!f._tempMe})); } else setMeId(meId===personModal.id?"":personModal.id); }} style={{display:"flex",alignItems:"center",gap:11,background:((personModal.mode==="edit"&&meId===personModal.id)||pForm._tempMe)?"rgba(99,102,241,0.12)":"rgba(255,255,255,0.04)",border:`1.5px solid ${((personModal.mode==="edit"&&meId===personModal.id)||pForm._tempMe)?"rgba(129,140,248,0.45)":"rgba(255,255,255,0.08)"}`,borderRadius:14,padding:"11px 14px",cursor:"pointer"}}>
                <span style={{fontSize:18,width:18,textAlign:"center",display:"inline-block",flexShrink:0,color:((personModal.mode==="edit"&&meId===personModal.id)||pForm._tempMe)?"#818cf8":"rgba(255,255,255,0.2)"}}>{((personModal.mode==="edit"&&meId===personModal.id)||pForm._tempMe)?"✓":"○"}</span>
                <div style={{flex:1,textAlign:"left"}}>
                  <div style={{color:((personModal.mode==="edit"&&meId===personModal.id)||pForm._tempMe)?"#818cf8":"rgba(255,255,255,0.55)",fontSize:13,fontWeight:600}}>This is me</div>
                  <div style={{color:"rgba(255,255,255,0.38)",fontSize:11,marginTop:1}}>"Mine" filter shows only my tasks</div>
                </div>
              </button>
              <button onClick={savePerson} style={{background:"linear-gradient(135deg,#6366f1,#8b5cf6)",border:"none",borderRadius:15,padding:"13px",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 18px rgba(99,102,241,0.38)"}}>{personModal.mode==="new"?"Add":"Save"}</button>
              {personModal.mode==="edit"&&<button onClick={()=>{deletePerson(personModal.id);setPersonModal(null);}} style={{...G(0.06,20),border:"1px solid rgba(248,113,113,0.2)",borderRadius:15,padding:"12px",color:"#f87171",fontSize:13,fontWeight:600,cursor:"pointer"}}>Remove Person</button>}
            </div>
          </div>
        )}

        {/* ── ZONE MODAL ────────────────────────────────────────── */}
        {zoneModal&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200}} onClick={()=>{setZoneModal(null);setEmojiPicker(false);}}>
            <div onClick={e=>e.stopPropagation()} style={{width:375,...G(0.18,40),borderRadius:"30px 30px 0 0",padding:"22px 22px 42px",display:"flex",flexDirection:"column",gap:16,boxShadow:"0 -20px 60px rgba(0,0,0,0.5)"}}>
              <div style={{width:34,height:4,background:"rgba(255,255,255,0.18)",borderRadius:2,margin:"0 auto"}}/>
              <div style={{color:"#fff",fontSize:18,fontWeight:700}}>{zoneModal.mode==="new"?"New Zone":"Edit Zone"}</div>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <button onClick={()=>setEmojiPicker(v=>!v)} style={{...G(0.12,20),border:"1px solid rgba(255,255,255,0.12)",borderRadius:14,width:52,height:52,fontSize:26,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{zForm.emoji}</button>
                <div style={{flex:1}}>
                  <input value={zForm.label} onChange={e=>{setZForm(f=>({...f,label:e.target.value}));if(e.target.value.trim())setZoneNameError(false);}} placeholder="Zone name" style={{background:"rgba(255,255,255,0.9)",borderRadius:14,padding:"12px 14px",color:"#111",fontSize:15,width:"100%",boxSizing:"border-box",fontFamily:"inherit",outline:"none",border:zoneNameError?"2px solid #f87171":"2px solid transparent"}}/>
                </div>
              </div>
              {emojiPicker&&(
                <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:250}} onClick={()=>setEmojiPicker(false)}>
                  <div onClick={e=>e.stopPropagation()} style={{width:320,background:"#26262c",borderRadius:20,padding:18,boxShadow:"0 20px 60px rgba(0,0,0,0.6)",border:"1px solid rgba(255,255,255,0.12)"}}>
                    <div style={{color:"rgba(255,255,255,0.85)",fontSize:15,fontWeight:600,marginBottom:12}}>Choose icon</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                      {ZONE_EMOJIS.map(e=><button key={e} onClick={()=>{setZForm(f=>({...f,emoji:e}));setEmojiPicker(false);}} style={{background:zForm.emoji===e?"rgba(255,255,255,0.2)":"transparent",border:"none",borderRadius:10,width:40,height:40,fontSize:22,cursor:"pointer"}}>{e}</button>)}
                    </div>
                  </div>
                </div>
              )}
              <button onClick={saveZone} style={{background:"linear-gradient(135deg,#6366f1,#8b5cf6)",border:"none",borderRadius:15,padding:"13px",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 18px rgba(99,102,241,0.38)"}}>{zoneModal.mode==="new"?"Add":"Save"}</button>
              {zoneModal.mode==="edit"&&<button onClick={()=>{deleteZone(zoneModal.id);setZoneModal(null);}} style={{...G(0.06,20),border:"1px solid rgba(248,113,113,0.2)",borderRadius:15,padding:"12px",color:"#f87171",fontSize:13,fontWeight:600,cursor:"pointer"}}>Delete Zone</button>}
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

const SHELL_STYLE={height:"100%",background:"#08080f",display:"flex",justifyContent:"center",alignItems:"stretch",fontFamily:"'Inter',system-ui,sans-serif",overflow:"hidden"};
const CARD_BG="linear-gradient(160deg,#1a1035 0%,#0d1f3c 45%,#0a2a1f 100%)";
const AUTH_INPUT={background:"rgba(255,255,255,0.9)",borderRadius:14,padding:"13px 16px",color:"#111",fontSize:15,width:"100%",boxSizing:"border-box",fontFamily:"inherit",outline:"none",border:"none"};
const AUTH_BTN={background:"linear-gradient(135deg,#6366f1,#8b5cf6)",border:"none",borderRadius:16,padding:"14px",color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 20px rgba(99,102,241,0.4)",width:"100%"};

function LoginScreen(){
  const [email,setEmail]=useState("");
  const [sent,setSent]=useState(false);
  const [code,setCode]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);

  const sendCode=async()=>{
    if(!email.trim()||!email.includes("@")){setError("Enter a valid email");return;}
    setError(""); setLoading(true);
    const {error}=await supabase.auth.signInWithOtp({ email:email.trim() });
    setLoading(false);
    if(error){setError(error.message||error.error_description||JSON.stringify(error));return;}
    setSent(true);
  };

  const verifyCode=async()=>{
    if(!code.trim()){setError("Enter the code from your email");return;}
    setError(""); setLoading(true);
    const {error}=await supabase.auth.verifyOtp({ email:email.trim(), token:code.trim(), type:"email" });
    setLoading(false);
    if(error){setError(error.message||error.error_description||JSON.stringify(error));return;}
    // on success, the auth listener in Root picks up the new session automatically
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
              <div style={{color:"rgba(255,255,255,0.4)",fontSize:13}}>We sent a 6-digit code to {email}</div>
            </div>
            <input
              type="text" inputMode="numeric" maxLength={6}
              placeholder="123456"
              value={code}
              onChange={e=>{setCode(e.target.value.replace(/\D/g,""));setError("");}}
              style={{...AUTH_INPUT,marginBottom:8,textAlign:"center",letterSpacing:6,fontSize:20,border:error?"2px solid #f87171":"2px solid transparent"}}
            />
            <div style={{height:16,marginBottom:8}}>
              {error&&<div style={{color:"#f87171",fontSize:12}}>{error}</div>}
            </div>
            <button onClick={verifyCode} disabled={loading} style={{...AUTH_BTN,opacity:loading?0.6:1}}>
              {loading?"Checking…":"Confirm code"}
            </button>
            <button onClick={()=>{setSent(false);setCode("");setError("");}} style={{background:"none",border:"none",color:"rgba(255,255,255,0.35)",fontSize:13,cursor:"pointer",padding:"12px",width:"100%"}}>Use a different email</button>
          </>
        ):(
          <>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e=>{setEmail(e.target.value);setError("");}}
              style={{...AUTH_INPUT,marginBottom:8,border:error?"2px solid #f87171":"2px solid transparent"}}
            />
            <div style={{height:16,marginBottom:8}}>
              {error&&<div style={{color:"#f87171",fontSize:12}}>{error}</div>}
            </div>
            <button onClick={sendCode} disabled={loading} style={{...AUTH_BTN,opacity:loading?0.6:1}}>
              {loading?"Sending…":"Send login code"}
            </button>
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
    const {data:household,error:hErr}=await supabase.rpc("create_household_with_person",{
      p_person_id:personId,p_name:name.trim(),p_color:color,p_avatar:avatarEmoji,
    }).single();
    if(hErr){setBusy(false);setError(hErr.message);return;}
    await supabase.rpc("seed_default_zones",{p_household_id:household.id});
    onReady({household,me:{id:personId,name:name.trim(),color,avatarEmoji}});
  };

  const joinHousehold=async()=>{
    if(!name.trim()){setError("Enter your name");return;}
    if(!inviteCode.trim()){setError("Enter the invite code");return;}
    setBusy(true); setError("");
    const personId=String(Date.now());
    const {data:household,error:hErr}=await supabase.rpc("join_household_by_code",{
      p_code:inviteCode.trim().toLowerCase(),p_person_id:personId,p_name:name.trim(),p_color:color,p_avatar:avatarEmoji,
    }).single();
    if(hErr){setBusy(false);setError(hErr.message.includes("not found")?"Invite code not found":hErr.message);return;}
    onReady({household,me:{id:personId,name:name.trim(),color,avatarEmoji}});
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
          <button onClick={()=>setMode("join")} style={{...AUTH_BTN,background:"rgba(255,255,255,0.08)",boxShadow:"none",border:"1px solid rgba(255,255,255,0.15)"}}>Join with invite code</button>
        </div>
      </div>
    );
  }

  return (
    <div style={SHELL_STYLE}>
      <div style={{width:"100%",maxWidth:480,display:"flex",flexDirection:"column",justifyContent:"center",padding:"32px 28px",background:CARD_BG,gap:12,overflowY:"auto"}}>
        <button onClick={()=>{setMode(null);setError("");}} style={{background:"none",border:"none",color:"rgba(255,255,255,0.4)",fontSize:14,cursor:"pointer",textAlign:"left",padding:0,marginBottom:8}}>‹ Back</button>
        <div style={{color:"#fff",fontSize:20,fontWeight:700,marginBottom:8}}>{mode==="create"?"Create your home":"Join a home"}</div>

        {mode==="join"&&(
          <input placeholder="Invite code" value={inviteCode} onChange={e=>setInviteCode(e.target.value)} style={AUTH_INPUT}/>
        )}
        <input placeholder="Your name" value={name} onChange={e=>setName(e.target.value)} style={AUTH_INPUT}/>

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
  useEffect(()=>{
    const setVh=()=>document.documentElement.style.setProperty("--app-height",`${window.innerHeight}px`);
    setVh();
    window.addEventListener("resize",setVh);
    return ()=>window.removeEventListener("resize",setVh);
  },[]);

  const [session,setSession]=useState(null);
  const [authLoading,setAuthLoading]=useState(true);
  const [me,setMe]=useState(null);
  const [household,setHousehold]=useState(null);

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{setSession(data.session);setAuthLoading(false);});
    const {data:listener}=supabase.auth.onAuthStateChange((_event,newSession)=>setSession(newSession));
    return ()=>listener.subscription.unsubscribe();
  },[]);

  if(authLoading){
    return <div style={{height:"var(--app-height,100dvh)",...SHELL_STYLE}}><div style={{margin:"auto",color:"rgba(255,255,255,0.4)"}}>Loading…</div></div>;
  }
  if(!session){
    return <div style={{height:"var(--app-height,100dvh)"}}><LoginScreen/></div>;
  }
  if(!household||!me){
    return <div style={{height:"var(--app-height,100dvh)"}}><HouseholdGate session={session} onReady={({household,me})=>{setHousehold(household);setMe(me);}}/></div>;
  }
  return (
    <div style={{height:"var(--app-height,100dvh)"}}>
      <MainApp household={household} me={me} onSignOut={()=>supabase.auth.signOut()}/>
    </div>
  );
}

