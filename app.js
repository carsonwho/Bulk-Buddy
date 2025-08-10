
// ====== State & Storage ======
const KEYS = {
  TARGETS: "bb:targets",
  FOODS: "bb:foods", // supports per oz or per serving records
  ENTRY_PREFIX: "bb:entries:", // + YYYY-MM-DD
  ENTRY_INDEX: "bb:entryIndex",
  WEIGHTS: "bb:weights_lb",
  REMINDERS: "bb:reminders",
};

function get(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function set(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function dateKey(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset()*60000);
  return z.toISOString().slice(0,10);
}

// ====== Targets calc (US input) ======
function lbToKg(lb){ return lb/2.20462; }
function inchToCm(inch){ return inch*2.54; }
function mifflin({sex, age, height_cm, weight_kg}){
  const s = sex === 'male' ? 5 : -161;
  return Math.round(10*weight_kg + 6.25*height_cm - 5*age + s);
}
function calcTargetsUS(input){
  const height_cm = inchToCm(input.height_in);
  const weight_kg = lbToKg(input.weight_lb);
  const bmr = mifflin({sex:input.sex, age:input.age, height_cm, weight_kg});
  const tdee = Math.round(bmr * input.activity);
  const calories = tdee + input.surplus;
  const protein_g = Math.round(input.weight_lb * input.protein_perlb);
  const fat_g = Math.round(input.weight_lb * input.fat_perlb);
  const kcal_pf = protein_g*4 + fat_g*9;
  const carbs_g = Math.max(Math.round((calories - kcal_pf)/4), 0);
  return { calories, protein_g, fat_g, carbs_g, height_cm, weight_kg };
}

// ====== UI helpers ======
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
function toast(msg){ alert(msg); }

// ====== Tabs ======
$$('nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('nav button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    $$('.tab').forEach(t => t.classList.remove('active'));
    $('#tab-'+btn.dataset.tab).classList.add('active');
  })
});

// ====== Today ======
let currentDate = dateKey();
$('#todayDate').textContent = currentDate;

function sumMacros(list){
  return list.reduce((a,e)=>({kcal:a.kcal+(e.kcal||0), p:a.p+(e.p||0), c:a.c+(e.c||0), f:a.f+(e.f||0)}), {kcal:0,p:0,c:0,f:0});
}
function renderTargetsSummary(){
  const t = get(KEYS.TARGETS, null);
  if (!t) { $('#targetsSummary').textContent = 'Set your targets first.'; return; }
  $('#targetsSummary').textContent = `Target • ${t.calories} kcal — P ${t.protein_g}g / C ${t.carbs_g}g / F ${t.fat_g}g`;
}
function loadEntries(date=currentDate){
  const list = get(KEYS.ENTRY_PREFIX+date, []);
  const t = get(KEYS.TARGETS, null);
  const totals = sumMacros(list);
  $('#eatenKcal').textContent = totals.kcal;
  $('#eatenP').textContent = totals.p;
  $('#eatenC').textContent = totals.c;
  $('#eatenF').textContent = totals.f;
  if (t){
    $('#remKcal').textContent = Math.max(t.calories - totals.kcal, 0);
    $('#remP').textContent = Math.max(t.protein_g - totals.p, 0);
    $('#remC').textContent = Math.max(t.carbs_g - totals.c, 0);
    $('#remF').textContent = Math.max(t.fat_g - totals.f, 0);
  }
  const cont = $('#entries');
  cont.innerHTML = '';
  if (!list.length){ cont.innerHTML = '<div class="dim">No entries.</div>'; return; }
  list.forEach((e,i)=>{
    const row = document.createElement('div');
    row.className = 'entry';
    row.innerHTML = `<div><b>${e.name||'Item'}</b><div class="dim small">${e.kcal} kcal — P ${e.p}g / C ${e.c}g / F ${e.f}g</div></div>
                     <div class="row"><button data-i="${i}" class="ghost del">✕</button></div>`;
    cont.appendChild(row);
  });
  cont.querySelectorAll('.del').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.i);
      list.splice(idx,1);
      set(KEYS.ENTRY_PREFIX+date, list);
      loadEntries(date);
    });
  });
}
function ensureIndex(date){
  const idx = get(KEYS.ENTRY_INDEX, []);
  if (!idx.includes(date)){ idx.unshift(date); set(KEYS.ENTRY_INDEX, idx); }
}

// Quick add
$('#qaAdd').addEventListener('click', () => {
  const name = $('#qaName').value.trim() || 'Quick add';
  const k = Number($('#qaK').value||0);
  const p = Number($('#qaP').value||0);
  const c = Number($('#qaC').value||0);
  const f = Number($('#qaF').value||0);
  const key = KEYS.ENTRY_PREFIX+currentDate;
  const list = get(key, []);
  list.push({name, kcal:k, p, c, f});
  set(key, list);
  ensureIndex(currentDate);
  $('#qaName').value = $('#qaK').value = $('#qaP').value = $('#qaC').value = $('#qaF').value = '';
  loadEntries();
});

// Library add: unit-aware
function migrateLegacy(f){
  if (f.kcal_per_oz != null || f.kcal_s != null) return f;
  if (f.kcal_per_100g != null){
    const factor = 0.283495; // 28.3495/100
    return {
      name: f.name,
      kcal_per_oz: Math.round(f.kcal_per_100g * factor),
      p_per_oz: Math.round(f.p_per_100g * factor),
      c_per_oz: Math.round(f.c_per_100g * factor),
      f_per_oz: Math.round(f.f_per_100g * factor),
    };
  }
  return f;
}
function currentFood(){
  const name = $('#libName').value.trim().toLowerCase();
  const foods = get(KEYS.FOODS, []).map(migrateLegacy);
  return foods.find(f => f.name.toLowerCase() === name) || null;
}
function renderLibMeta(){
  const f = currentFood();
  const meta = $('#libMeta'); const quick = $('#libQuick'); quick.innerHTML='';
  if (!f){ meta.textContent = 'Not found in library.'; return; }
  if (f.kcal_per_oz != null){
    meta.innerHTML = `<span class="badge">per oz</span> ${f.kcal_per_oz} kcal, P${f.p_per_oz} C${f.c_per_oz} F${f.f_per_oz} (per oz)`;
    $('#libUnit').value='oz'; $('#libUnit').disabled=false;
    [['1 oz',1], ['4 oz (¼ lb)',4], ['8 oz (½ lb)',8], ['1 cup ≈ 8 oz',8], ['½ cup ≈ 4 oz',4]].forEach(([label,oz])=>{
      const b=document.createElement('button'); b.className='secondary'; b.textContent=label;
      b.addEventListener('click', ()=>{ $('#libAmount').value=oz; $('#libUnit').value='oz'; });
      quick.appendChild(b);
    });
  } else if (f.kcal_s != null){
    meta.innerHTML = `<span class="badge">per serving</span> ${f.kcal_s} kcal, P${f.p_s} C${f.c_s} F${f.f_s} — <b>${f.label||'1 serving'}</b>`;
    $('#libUnit').value='serv'; $('#libUnit').disabled=false;
    [['½ serving',0.5], ['1 serving',1], ['2 servings',2]].forEach(([label,n])=>{
      const b=document.createElement('button'); b.className='secondary'; b.textContent=label;
      b.addEventListener('click', ()=>{ $('#libAmount').value=n; $('#libUnit').value='serv'; });
      quick.appendChild(b);
    });
  } else {
    meta.textContent = 'This food has unsupported format.';
  }
}
$('#libName').addEventListener('input', renderLibMeta);

$('#libAdd').addEventListener('click', () => {
  const f = currentFood(); if (!f){ toast('Food not found.'); return; }
  const amount = Number($('#libAmount').value||0);
  const unit = $('#libUnit').value;
  if (!amount) return;
  let item = null;
  if (unit==='oz' && f.kcal_per_oz != null){
    item = {
      name: f.name,
      kcal: Math.round(f.kcal_per_oz * amount),
      p: Math.round(f.p_per_oz * amount),
      c: Math.round(f.c_per_oz * amount),
      f: Math.round(f.f_per_oz * amount),
    };
  } else if (unit==='serv' && f.kcal_s != null){
    item = {
      name: f.name + (f.label ? ` (${f.label})` : ''),
      kcal: Math.round(f.kcal_s * amount),
      p: Math.round(f.p_s * amount),
      c: Math.round(f.c_s * amount),
      f: Math.round(f.f_s * amount),
    };
  } else {
    toast('Selected unit is not supported for this food.');
    return;
  }
  const key = KEYS.ENTRY_PREFIX+currentDate;
  const list = get(key, []); list.push(item); set(key, list);
  ensureIndex(currentDate);
  $('#libAmount').value='';
  loadEntries();
});

// Date nav
$('#prevDay').addEventListener('click', ()=>{
  const d = new Date(currentDate); d.setDate(d.getDate()-1);
  currentDate = dateKey(d); $('#todayDate').textContent=currentDate; loadEntries();
});
$('#nextDay').addEventListener('click', ()=>{
  const d = new Date(currentDate); d.setDate(d.getDate()+1);
  currentDate = dateKey(d); $('#todayDate').textContent=currentDate; loadEntries();
});

// ====== Add Food tab ======
function modeSwap(){
  const oz = $('#modeOz').checked;
  $('#perOz').style.display = oz ? 'block' : 'none';
  $('#perServ').style.display = oz ? 'none' : 'block';
}
$('#modeOz').addEventListener('change', modeSwap);
$('#modeServ').addEventListener('change', modeSwap);
$('#presetCup').addEventListener('click', ()=>{
  $('#fServLabel').value = '1 cup (8 fl oz)';
});

function renderFoodList(){
  const foods = get(KEYS.FOODS, []).map(migrateLegacy);
  const cont = $('#foodList'); cont.innerHTML='';
  if (!foods.length){ cont.innerHTML = '<div class="dim small">No foods saved.</div>'; return; }
  foods.forEach(f=>{
    const chip = document.createElement('div');
    chip.className = 'chip';
    if (f.kcal_per_oz != null){
      chip.textContent = `${f.name} — ${f.kcal_per_oz} kcal/oz · P${f.p_per_oz} C${f.c_per_oz} F${f.f_per_oz}`;
    } else if (f.kcal_s != null){
      chip.textContent = `${f.name} — ${f.kcal_s} kcal/serv · P${f.p_s} C${f.c_s} F${f.f_s} (${f.label||'serving'})`;
    } else chip.textContent = f.name;
    cont.appendChild(chip);
  });
}

$('#saveFoodOz').addEventListener('click', ()=>{
  const name = $('#fNameOz').value.trim(); if (!name) return;
  const rec = {
    name,
    kcal_per_oz: Number($('#fKoz').value||0),
    p_per_oz: Number($('#fPoz').value||0),
    c_per_oz: Number($('#fCoz').value||0),
    f_per_oz: Number($('#fFoz').value||0),
  };
  const foods = get(KEYS.FOODS, []).map(migrateLegacy);
  const i = foods.findIndex(x=>x.name.toLowerCase()===name.toLowerCase());
  if (i>=0) foods[i]=rec; else foods.push(rec);
  set(KEYS.FOODS, foods);
  $('#fNameOz').value = $('#fKoz').value = $('#fPoz').value = $('#fCoz').value = $('#fFoz').value = '';
  renderFoodList();
});

$('#saveFoodServ').addEventListener('click', ()=>{
  const name = $('#fNameServ').value.trim(); if (!name) return;
  const rec = {
    name,
    label: $('#fServLabel').value.trim() || '1 serving',
    kcal_s: Number($('#fKs').value||0),
    p_s: Number($('#fPs').value||0),
    c_s: Number($('#fCs').value||0),
    f_s: Number($('#fFs').value||0),
  };
  const foods = get(KEYS.FOODS, []).map(migrateLegacy);
  const i = foods.findIndex(x=>x.name.toLowerCase()===name.toLowerCase());
  if (i>=0) foods[i]=rec; else foods.push(rec);
  set(KEYS.FOODS, foods);
  $('#fNameServ').value = $('#fServLabel').value = $('#fKs').value = $('#fPs').value = $('#fCs').value = $('#fFs').value = '';
  renderFoodList();
});

// Open Food Facts search
async function offSearch(q){
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&json=1&page_size=20&fields=product_name,brands,nutriments,serving_size,countries_tags&search_terms=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Search failed');
  const data = await res.json();
  return (data.products||[]).filter(p => !p.countries_tags || p.countries_tags.includes('en:united-states'));
}
function nutrVal(n, key){
  if (!n) return 0;
  if (key==='kcal_100g') return n['energy-kcal_100g'] ?? (n.energy_100g ? Math.round(n.energy_100g/4.184) : 0);
  if (key==='kcal_serving') return n['energy-kcal_serving'] ?? (n.energy_serving ? Math.round(n.energy_serving/4.184) : 0);
  return n[key] ?? 0;
}
$('#offSearch').addEventListener('click', async ()=>{
  const q = $('#offQuery').value.trim(); if (!q) return;
  const cont = $('#offResults'); cont.innerHTML = '<div class="dim small">Searching…</div>';
  try{
    const products = await offSearch(q);
    cont.innerHTML='';
    if (!products.length){ cont.innerHTML = '<div class="dim small">No results.</div>'; return; }
    products.forEach(p => {
      const n = p.nutriments || {};
      const kcal100 = Math.round(nutrVal(n,'kcal_100g'));
      const p100 = Math.round(nutrVal(n,'proteins_100g'));
      const c100 = Math.round(nutrVal(n,'carbohydrates_100g'));
      const f100 = Math.round(nutrVal(n,'fat_100g'));
      const kcalServ = Math.round(nutrVal(n,'kcal_serving'));
      const pServ = Math.round(nutrVal(n,'proteins_serving'));
      const cServ = Math.round(nutrVal(n,'carbohydrates_serving'));
      const fServ = Math.round(nutrVal(n,'fat_serving'));
      const brand = p.brands ? ` (${p.brands.split(',')[0]})` : '';
      const row = document.createElement('div');
      row.className = 'entry';
      const title = (p.product_name||'Unnamed') + brand;
      const perOz = kcal100 ? {
        kcal: Math.round(kcal100 * 0.283495),
        p: Math.round(p100 * 0.283495),
        c: Math.round(c100 * 0.283495),
        f: Math.round(f100 * 0.283495),
      } : null;
      row.innerHTML = `<div><b>${title}</b>
        <div class="dim small">per 100g: ${kcal100||'–'} kcal · P${p100||'–'} C${c100||'–'} F${f100||'–'}</div>
        ${kcalServ?`<div class="dim small">per serving (${p.serving_size||'label unknown'}): ${kcalServ} kcal · P${pServ} C${cServ} F${fServ}</div>`:''}
      </div>
      <div class="row">
        <button class="secondary imp-oz" ${perOz?'':'disabled'}>Import per oz</button>
        <button class="secondary imp-serv" ${kcalServ?'':'disabled'}>Import per serving</button>
      </div>`;
      row.querySelector('.imp-oz')?.addEventListener('click', ()=>{
        const foods = get(KEYS.FOODS, []).map(migrateLegacy);
        const rec = {
          name: title,
          kcal_per_oz: perOz.kcal||0,
          p_per_oz: perOz.p||0,
          c_per_oz: perOz.c||0,
          f_per_oz: perOz.f||0,
        };
        const i = foods.findIndex(x=>x.name.toLowerCase()===title.toLowerCase());
        if (i>=0) foods[i]=rec; else foods.push(rec);
        set(KEYS.FOODS, foods);
        toast('Imported to library (per oz).');
        renderFoodList();
      });
      row.querySelector('.imp-serv')?.addEventListener('click', ()=>{
        const foods = get(KEYS.FOODS, []).map(migrateLegacy);
        const label = p.serving_size || '1 serving';
        const rec = {
          name: title,
          label,
          kcal_s: kcalServ||0,
          p_s: pServ||0,
          c_s: cServ||0,
          f_s: fServ||0,
        };
        const i = foods.findIndex(x=>x.name.toLowerCase()===title.toLowerCase());
        if (i>=0) foods[i]=rec; else foods.push(rec);
        set(KEYS.FOODS, foods);
        toast('Imported to library (per serving).');
        renderFoodList();
      });
      $('#offResults').appendChild(row);
    });
  } catch(e){
    cont.innerHTML = '<div class="dim small">Search failed. Try again.</div>';
  }
});

// ====== Targets tab (US) ======
$('#saveTargets').addEventListener('click', ()=>{
  const sex = $('#tSex').value;
  const age = Number($('#tAge').value||0);
  const feet = Number($('#tFeet').value||0);
  const inch = Number($('#tInch').value||0);
  const height_in = feet*12 + inch;
  const weight_lb = Number($('#tWeightLb').value||0);
  const activity = Number($('#tAct').value||1.2);
  const surplus = Number($('#tSurplus').value||0);
  const protein_perlb = Number($('#tProtLb').value||0.9);
  const fat_perlb = Number($('#tFatLb').value||0.4);

  const core = calcTargetsUS({sex, age, height_in, weight_lb, activity, surplus, protein_perlb, fat_perlb});
  const t = { units:'us', sex, age, height_in, weight_lb, activity, surplus, protein_perlb, fat_perlb, ...core };
  set(KEYS.TARGETS, t);
  $('#targetsOutput').textContent = `Saved. Calories ${t.calories} | P ${t.protein_g}g C ${t.carbs_g}g F ${t.fat_g}g`;
  renderTargetsSummary(); loadEntries();
});

// ====== Reminders ======
let reminderTimer = null;
function parseTimes(tstr){ return tstr.split(',').map(s=>s.trim()).filter(Boolean); }
function requestNotifPermission(){
  if (!('Notification' in window)) { toast('Notifications not supported.'); return; }
  Notification.requestPermission().then(p => {
    toast(p === 'granted' ? 'Notifications enabled.' : 'Notifications blocked.');
  });
}
$('#enableNotifs').addEventListener('click', requestNotifPermission);
function nowHM(){ const d = new Date(); return d.toTimeString().slice(0,5); }
function notify(title, body){
  const audio = $('#beep');
  try { audio.currentTime = 0; audio.play().catch(()=>{}); } catch {}
  if ('Notification' in window && Notification.permission==='granted'){
    new Notification(title, { body, icon: 'icon.png' });
  } else {
    document.title = '⏰ ' + title + ' — ' + body;
    setTimeout(()=>{ document.title='Bulk Buddy'; }, 5000);
    alert(title + '\n' + body);
  }
}
function scheduleLoop(){
  if (reminderTimer) clearInterval(reminderTimer);
  const times = parseTimes($('#rTimes').value);
  const prepDay = Number($('#rWday').value||1);
  const prepTime = $('#rTime').value || '16:00';
  set(KEYS.REMINDERS, { times, prepDay, prepTime });
  reminderTimer = setInterval(()=>{
    const hm = nowHM();
    if (times.includes(hm)) notify('Meal time', 'Log your meal and hit your macros.');
    const d = new Date(); const day = ((d.getDay()+1)); // Sunday=1..Saturday=7
    if (day===prepDay && hm===prepTime) notify('Meal prep', 'Prep your meals for the week.');
  }, 1000*20);
  toast('Reminders started (tab must remain open).');
}
$('#startRem').addEventListener('click', scheduleLoop);
$('#stopRem').addEventListener('click', ()=>{ if(reminderTimer) clearInterval(reminderTimer); toast('Reminders stopped.'); });

// ICS export
function dl(filename, text){
  const blob = new Blob([text], {type:'text/calendar;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function pad(n){ return String(n).padStart(2,'0'); }
function toLocalICS(dt){
  return dt.getFullYear()+pad(dt.getMonth()+1)+pad(dt.getDate())+'T'+pad(dt.getHours())+pad(dt.getMinutes())+'00';
}
function mealsICS(){
  const { times=[] } = get(KEYS.REMINDERS, {times:parseTimes($('#rTimes').value)});
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let out = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//BulkBuddy//EN\n';
  for (const t of times){
    const [h,m] = t.split(':').map(Number);
    const dt = new Date(startDate); dt.setHours(h||0, m||0, 0, 0);
    out += 'BEGIN:VEVENT\nSUMMARY:Meal time\nDTSTART:'+toLocalICS(dt)+'\nRRULE:FREQ=DAILY\nEND:VEVENT\n';
  }
  out += 'END:VCALENDAR';
  return out;
}
function prepICS(){
  const { prepDay=1, prepTime='16:00' } = get(KEYS.REMINDERS, {});
  const [h,m] = (prepTime||'16:00').split(':').map(Number);
  const now = new Date();
  const today = (now.getDay()+1);
  let add = (prepDay - today);
  if (add < 0) add += 7;
  const dt = new Date(now); dt.setDate(now.getDate()+add); dt.setHours(h||16, m||0, 0, 0);
  const names = ['SU','MO','TU','WE','TH','FR','SA'];
  const byday = names[(prepDay-1+7)%7];
  const out = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//BulkBuddy//EN\n' +
    'BEGIN:VEVENT\nSUMMARY:Meal prep\nDTSTART:'+toLocalICS(dt)+'\nRRULE:FREQ=WEEKLY;BYDAY='+byday+'\nEND:VEVENT\nEND:VCALENDAR';
  return out;
}
$('#dlMealsIcs').addEventListener('click', ()=> dl('bulk-buddy-meals.ics', mealsICS()));
$('#dlPrepIcs').addEventListener('click', ()=> dl('bulk-buddy-meal-prep.ics', prepICS()));

// ====== History & Weights ======
function renderWeights(){
  const arr = get(KEYS.WEIGHTS, []);
  const cont = $('#weights'); cont.innerHTML='';
  if (!arr.length){ cont.innerHTML = '<div class="dim small">No weights yet.</div>'; return; }
  arr.sort((a,b)=>a.date<b.date?-1:1);
  arr.forEach(w => {
    const row = document.createElement('div');
    row.className = 'entry';
    row.innerHTML = `<div>${w.date}</div><div><b>${w.lb}</b> lb</div>`;
    cont.appendChild(row);
  });
}
$('#saveWt').addEventListener('click', ()=>{
  const date = $('#wDate').value || dateKey();
  const lb = Number($('#wLb').value||0);
  const arr = get(KEYS.WEIGHTS, []);
  const ex = arr.find(w => w.date === date);
  if (ex) ex.lb = lb; else arr.push({date, lb});
  set(KEYS.WEIGHTS, arr);
  $('#wLb').value='';
  renderWeights();
});

function renderDays(){
  const idx = get(KEYS.ENTRY_INDEX, []);
  const cont = $('#daysList'); cont.innerHTML='';
  if (!idx.length){ cont.innerHTML = '<div class="dim small">No days yet.</div>'; return; }
  idx.forEach(d => {
    const sum = sumMacros(get(KEYS.ENTRY_PREFIX+d, []));
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.textContent = `${d} — ${sum.kcal} kcal (P${sum.p}g C${sum.c}g F${sum.f}g)`;
    cont.appendChild(chip);
  });
}

// ====== Settings: Export/Import/Clear ======
$('#exportJson').addEventListener('click', ()=>{
  const data = {};
  for (let i=0;i<localStorage.length;i++){
    const k = localStorage.key(i);
    if (k && (k.startsWith('bb:'))) data[k] = localStorage.getItem(k);
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download='bulk-buddy-export.json';
  document.body.appendChild(a); a.click(); a.remove();
});
$('#importFile').addEventListener('change', async ev=>{
  const file = ev.target.files[0]; if (!file) return;
  const text = await file.text();
  const obj = JSON.parse(text);
  Object.entries(obj).forEach(([k,v]) => { localStorage.setItem(k, v); });
  toast('Imported. Reloading...'); location.reload();
});
$('#clearData').addEventListener('click', ()=>{
  if (!confirm('Clear all Bulk Buddy data?')) return;
  Object.keys(localStorage).forEach(k => { if (k.startsWith('bb:')) localStorage.removeItem(k); });
  location.reload();
});

// ====== Init ======
(function init(){
  document.title = 'Bulk Buddy';
  $('#wDate').value = dateKey();
  renderTargetsSummary();
  loadEntries();
  renderFoodList();
  renderWeights();
  renderDays();
})();
