const { summaryData, byYearData, termReasons, rotationSchoolAvgHours = [], meta = {} } = window.NURSING_DASHBOARD_DATA;

// ── STATE ─────────────────────────────────────────────────────────────────────
let selectedSchool = null;
let charts = {};
let activeTab = 's1';

// ── UTILITIES ─────────────────────────────────────────────────────────────────
function toTitle(s) { return s.replace(/\b\w/g, c => c.toUpperCase()); }
function pct(v, dec=1) { return v != null ? (v*100).toFixed(dec)+'%' : 'N/A'; }
function shortName(s) { return toTitle(s).replace('University','Univ.').replace('College','Col.'); }

const palette = [
  '#3b82f6','#06b6d4','#10b981','#f59e0b','#a78bfa',
  '#f87171','#34d399','#60a5fa','#fbbf24','#818cf8',
  '#2dd4bf','#fb923c','#4ade80','#e879f9','#38bdf8'
];
function schoolColor(name) {
  const idx = summaryData.findIndex(d => d.school === name);
  return palette[idx % palette.length];
}

function compositeScore(d) {
  if (!d.passRate || !d.retention) return -1;
  return (d.passRate / 100) * d.retention * Math.log10(Math.max(d.nurses, 1) + 1);
}

function computeZScore(data) {
  const valid = data.filter(d => d.passRate && d.tenure);
  const fields = ['passRate','retention','nurses','tenure'];
  const stats = {};
  fields.forEach(f => {
    const vals = valid.map(d => d[f] || 0);
    const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
    const std = Math.sqrt(vals.map(v=>(v-mean)**2).reduce((a,b)=>a+b,0)/vals.length) || 1;
    stats[f] = {mean, std};
  });
  return data.map(d => {
    let z = 0, count = 0;
    fields.forEach(f => {
      if (d[f] != null) {
        z += (d[f] - stats[f].mean) / stats[f].std;
        count++;
      }
    });
    return {...d, zScore: count ? +(z / count).toFixed(3) : null};
  });
}

function getFiltered() {
  const school = document.getElementById('schoolFilter').value;
  const minN = +document.getElementById('minNurses').value;
  const minR = +document.getElementById('minRetention').value / 100;
  const minP = +document.getElementById('minPass').value;
  return summaryData.filter(d => {
    if (school !== 'all' && d.school !== school) return false;
    if (d.nurses < minN) return false;
    if (d.retention < minR) return false;
    if (minP > 0 && (!d.passRate || d.passRate < minP)) return false;
    return true;
  });
}

function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

// ── TABS ──────────────────────────────────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.section-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.section-panel').forEach(p => p.classList.remove('active'));
  document.querySelector(`.tab-${tab}`).classList.add('active');
  document.getElementById(`panel-${tab}`).classList.add('active');
  renderSection(tab);
}

// ── INIT ──────────────────────────────────────────────────────────────────────
function init() {
  const maxN = meta.maxNurses || Math.max(...summaryData.map(d => d.nurses), 1);
  const nurseSlider = document.getElementById('minNurses');
  nurseSlider.max = String(maxN);
  if (+nurseSlider.value > maxN) {
    nurseSlider.value = String(maxN);
    document.getElementById('minNursesVal').textContent = String(maxN);
  }

  const sel = document.getElementById('schoolFilter');
  [...summaryData].sort((a,b)=>b.nurses-a.nurses).forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.school; opt.textContent = toTitle(d.school);
    sel.appendChild(opt);
  });
  document.getElementById('schoolFilter').addEventListener('change', render);
  document.getElementById('minNurses').addEventListener('input', e => {
    document.getElementById('minNursesVal').textContent = e.target.value; render();
  });
  document.getElementById('minRetention').addEventListener('input', e => {
    document.getElementById('minRetentionVal').textContent = e.target.value; render();
  });
  document.getElementById('minPass').addEventListener('input', e => {
    document.getElementById('minPassVal').textContent = e.target.value; render();
  });
  render();
}

function resetFilters() {
  document.getElementById('schoolFilter').value = 'all';
  document.getElementById('minNurses').value = 1;
  document.getElementById('minNursesVal').textContent = '1';
  document.getElementById('minRetention').value = 0;
  document.getElementById('minRetentionVal').textContent = '0';
  document.getElementById('minPass').value = 0;
  document.getElementById('minPassVal').textContent = '0';
  selectedSchool = null;
  render();
}

function render() {
  const filtered = getFiltered();
  updateKPIs(filtered);
  renderSection(activeTab, filtered);
}

function renderSection(tab, filtered) {
  if (!filtered) filtered = getFiltered();
  if (tab === 's1') renderAcademic(filtered);
  else if (tab === 's2') renderCommitment(filtered);
  else if (tab === 's3') renderWorkforce(filtered);
  else if (tab === 's4') renderCombined(filtered);
}

// ── KPIs ──────────────────────────────────────────────────────────────────────
function updateKPIs(data) {
  document.getElementById('kpiSchools').textContent = data.length;
  const withPass = data.filter(d => d.passRate);
  const avgPass = withPass.length ? (withPass.reduce((s,d)=>s+d.passRate,0)/withPass.length).toFixed(1)+'%' : 'N/A';
  const avgRet = data.length ? pct(data.reduce((s,d)=>s+d.retention,0)/data.length) : 'N/A';
  const totalN = data.reduce((s,d)=>s+d.nurses,0);
  document.getElementById('kpiPassRate').textContent = avgPass;
  document.getElementById('kpiRetention').textContent = avgRet;
  document.getElementById('kpiNurses').textContent = totalN.toLocaleString();
}

// ── SECTION 1: ACADEMIC ───────────────────────────────────────────────────────
function renderAcademic(data) {
  // Pass rate bar
  destroyChart('passRate');
  const passData = [...data].filter(d => d.passRate).sort((a,b)=>b.passRate-a.passRate);
  charts['passRate'] = new Chart(document.getElementById('passRateChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: passData.map(d => shortName(d.school)),
      datasets: [{
        data: passData.map(d => +d.passRate.toFixed(1)),
        backgroundColor: passData.map(d => d.passRate>=90?'#10b981cc':d.passRate>=80?'#f59e0bcc':'#ef4444cc'),
        borderColor: passData.map(d => d.passRate>=90?'#10b981':d.passRate>=80?'#f59e0b':'#ef4444'),
        borderWidth: 1, borderRadius: 4,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {display:false},
        tooltip: { callbacks:{label: c=>`Pass Rate: ${c.raw}%`}, backgroundColor:'#111827',borderColor:'#1e2d45',borderWidth:1,titleColor:'#fff',bodyColor:'#94a3b8',padding:10 }
      },
      scales: {
        x: { min:60, max:100, grid:{color:'#1e2d45'}, ticks:{color:'#64748b',callback:v=>v+'%'} },
        y: { grid:{display:false}, ticks:{color:'#94a3b8',font:{size:10}} }
      }
    }
  });

  destroyChart('gpa');
  const gpaWrap = document.getElementById('gpaChart').closest('.chart-wrap');
  gpaWrap.style.position = 'relative';
  const oldOv = gpaWrap.querySelector('.no-data-overlay');
  if (oldOv) oldOv.remove();

  const hasGpa = passData.some(d => d.gpa != null);
  const gpaCtx = document.getElementById('gpaChart').getContext('2d');
  charts['gpa'] = new Chart(gpaCtx, {
    type: 'bar',
    data: {
      labels: passData.map(d => shortName(d.school)),
      datasets: [{
        data: passData.map(d => (d.gpa != null ? +d.gpa.toFixed(2) : null)),
        backgroundColor: passData.map(d => {
          if (d.gpa == null) return 'rgba(100,116,139,0.25)';
          if (d.gpa >= 3.5) return 'rgba(16,185,129,0.55)';
          if (d.gpa >= 3.0) return 'rgba(245,158,11,0.55)';
          return 'rgba(239,68,68,0.45)';
        }),
        borderColor: passData.map(d => {
          if (d.gpa == null) return 'rgba(100,116,139,0.4)';
          if (d.gpa >= 3.5) return '#10b981';
          if (d.gpa >= 3.0) return '#f59e0b';
          return '#ef4444';
        }),
        borderWidth: 1, borderRadius: 4,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend:{display:false},
        tooltip:{
          enabled: hasGpa,
          callbacks:{ label: c => (c.raw != null ? `GPA: ${c.raw}` : 'No GPA') },
          backgroundColor:'#111827',borderColor:'#1e2d45',borderWidth:1,titleColor:'#fff',bodyColor:'#94a3b8',padding:10
        }
      },
      scales: {
        x: { min:0, max:4.0, grid:{color:'#1e2d45'}, ticks:{color:'#64748b'} },
        y: { grid:{display:false}, ticks:{color:'#94a3b8',font:{size:10}} }
      }
    }
  });
  if (!hasGpa) {
    setTimeout(() => {
      const el = document.createElement('div');
      el.className = 'no-data-overlay';
      el.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;pointer-events:none;';
      el.innerHTML = '<div style="font-size:2rem">&#x1F4CA;</div><div style="font-family:var(--mono);font-size:0.75rem;color:var(--muted);text-align:center">GPA data not available<br>in current source data</div>';
      gpaWrap.appendChild(el);
    }, 50);
  }

  // Trend
  renderTrendChart(data);

  // Academic table
  const tbody = document.getElementById('academicTable');
  const years = [2022,2023,2024,2025];
  const sorted = [...data].sort((a,b)=>(b.passRate||0)-(a.passRate||0));
  tbody.innerHTML = sorted.map(d => {
    const passColor = !d.passRate?'#64748b':d.passRate>=90?'#10b981':d.passRate>=80?'#f59e0b':'#ef4444';
    const yrCells = years.map(y => {
      const row = byYearData.find(r=>r.school===d.school&&r.year===y);
      if (!row) return '<td style="color:var(--muted);font-family:var(--mono);font-size:0.78rem">—</td>';
      const c = row.passRate>=90?'#10b981':row.passRate>=80?'#f59e0b':'#ef4444';
      return `<td style="color:${c};font-family:var(--mono);font-size:0.78rem">${row.passRate.toFixed(1)}%</td>`;
    }).join('');
    const tag = !d.passRate?'<span class="tag tag-na">NO DATA</span>':d.passRate>=90?'<span class="tag tag-top">EXCELLENT</span>':d.passRate>=80?'<span class="tag tag-mid">PASSING</span>':'<span class="tag tag-low">BELOW MIN</span>';
    return `<tr onclick="selectSchool(${JSON.stringify(d.school)})" class="${selectedSchool===d.school?'selected':''}">
      <td class="school-name-cell">${toTitle(d.school)}</td>
      <td style="color:${passColor};font-family:var(--mono);font-size:0.82rem">${d.passRate?d.passRate.toFixed(1)+'%':'—'}</td>
      ${yrCells}
      <td class="gpa-na">${d.gpa!=null?Number(d.gpa).toFixed(3):'N/A'}</td>
      <td>${tag}</td>
    </tr>`;
  }).join('');
}

function renderTrendChart(data) {
  destroyChart('trend');
  const schoolsToShow = selectedSchool
    ? [selectedSchool]
    : data.filter(d=>d.nurses>=20).map(d=>d.school).slice(0,6);
  const years = [2022,2023,2024,2025];
  const datasets = schoolsToShow.map(school => ({
    label: toTitle(school),
    data: years.map(y => { const r=byYearData.find(r=>r.school===school&&r.year===y); return r?r.passRate:null; }),
    borderColor: schoolColor(school),
    backgroundColor: schoolColor(school)+'22',
    borderWidth: selectedSchool===school?2.5:1.5,
    pointRadius:4, pointHoverRadius:6, tension:0.3, fill:false, spanGaps:true,
  }));
  datasets.push({label:'GA Min (80%)',data:years.map(()=>80),borderColor:'#ef444455',borderDash:[6,4],borderWidth:1,pointRadius:0,fill:false});
  charts['trend'] = new Chart(document.getElementById('trendChart').getContext('2d'), {
    type:'line', data:{labels:years,datasets},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#94a3b8',boxWidth:12,font:{size:11}}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${c.raw?c.raw.toFixed(1)+'%':'N/A'}`},backgroundColor:'#111827',borderColor:'#1e2d45',borderWidth:1,titleColor:'#fff',bodyColor:'#94a3b8',padding:10}},
      scales:{x:{grid:{color:'#1e2d45'},ticks:{color:'#64748b'}},y:{min:60,max:100,grid:{color:'#1e2d45'},ticks:{color:'#64748b',callback:v=>v+'%'}}}
    }
  });
}

// ── SECTION 2: COMMITMENT ─────────────────────────────────────────────────────
function renderCommitment(data) {
  destroyChart('retention');
  destroyChart('rotation');
  const sortedRet = [...data].filter(d => d.nurses >= 5).sort((a, b) => b.retention - a.retention);
  const rotLookup = new Map(
    rotationSchoolAvgHours.map((x) => [x.school, x.rotationAvgHoursPerPerson])
  );
  const rotationAvgFor = (d) => rotLookup.get(d.school) ?? d.rotationAvgHoursPerPerson ?? null;
  const commitmentSchools = sortedRet.filter((d) => {
    const a = rotationAvgFor(d);
    return a != null && a > 0;
  });

  const rotationHoursStyle = (avg) => {
    if (avg == null || !(avg > 0)) {
      return { bg: 'rgba(100,116,139,0.4)', border: '#64748b' };
    }
    if (avg >= 70) return { bg: '#10b981cc', border: '#10b981' };
    if (avg >= 55) return { bg: '#f59e0bcc', border: '#f59e0b' };
    return { bg: '#ef4444cc', border: '#ef4444' };
  };

  if (commitmentSchools.length > 0) {
    charts['retention'] = new Chart(document.getElementById('retentionChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: commitmentSchools.map(d => shortName(d.school)),
        datasets: [{
          label: 'Vizient retention',
          data: commitmentSchools.map(d => +(d.retention * 100).toFixed(1)),
          backgroundColor: commitmentSchools.map(d => d.retention >= 0.75 ? '#10b981cc' : d.retention >= 0.65 ? '#f59e0bcc' : '#ef4444cc'),
          borderColor: commitmentSchools.map(d => d.retention >= 0.75 ? '#10b981' : d.retention >= 0.65 ? '#f59e0b' : '#ef4444'),
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: c => `Vizient retention: ${c.raw}% (still employed / all hires in file)`,
            },
            backgroundColor: '#111827',
            borderColor: '#1e2d45',
            borderWidth: 1,
            titleColor: '#fff',
            bodyColor: '#94a3b8',
            padding: 10,
          },
        },
        scales: {
          x: { min: 0, max: 100, grid: { color: '#1e2d45' }, ticks: { color: '#64748b', callback: v => v + '%' } },
          y: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } },
        },
      },
    });

    const hrsRows = commitmentSchools.map((d) => ({
      school: d.school,
      rotationAvgHoursPerPerson: rotationAvgFor(d),
    }));
    charts['rotation'] = new Chart(document.getElementById('rotationChart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: hrsRows.map((d) => shortName(d.school)),
        datasets: [{
          label: 'Avg hours/person (rotations)',
          data: hrsRows.map((d) => +d.rotationAvgHoursPerPerson.toFixed(2)),
          backgroundColor: hrsRows.map((d) => rotationHoursStyle(d.rotationAvgHoursPerPerson).bg),
          borderColor: hrsRows.map((d) => rotationHoursStyle(d.rotationAvgHoursPerPerson).border),
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) => {
                const row = hrsRows[c.dataIndex];
                return `Avg hrs/person: ${row.rotationAvgHoursPerPerson.toFixed(2)}`;
              },
            },
            backgroundColor: '#111827',
            borderColor: '#1e2d45',
            borderWidth: 1,
            titleColor: '#fff',
            bodyColor: '#94a3b8',
            padding: 10,
          },
        },
        scales: {
          x: {
            min: 0,
            grid: { color: '#1e2d45' },
            ticks: { color: '#64748b', callback: (v) => `${v} h` },
          },
          y: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } },
        },
      },
    });
  }

  const rankBody = document.getElementById('softSkillsRankTable');
  const softRank = [...summaryData]
    .filter(d => d.softFinalScore != null)
    .sort((a, b) => b.softFinalScore - a.softFinalScore);
  rankBody.innerHTML = softRank.length
    ? softRank.map((d, i) => {
        const fs = d.softFinalScore;
        const fsColor = fs >= 0 ? '#10b981' : fs >= -0.3 ? '#f59e0b' : '#ef4444';
        return `<tr>
      <td style="font-family:var(--mono);color:var(--muted)">${i + 1}</td>
      <td class="school-name-cell">${toTitle(d.school)}</td>
      <td style="font-family:var(--mono);color:${fsColor};font-size:0.82rem">${fs.toFixed(4)}</td>
      <td style="font-family:var(--mono);font-size:0.82rem">${d.softAvgHours != null ? d.softAvgHours.toFixed(2) : '—'}</td>
      <td style="font-family:var(--mono);font-size:0.82rem">${d.softRetention != null ? pct(d.softRetention) : '—'}</td>
    </tr>`;
      }).join('')
    : '<tr><td colspan="5" style="color:var(--muted);padding:16px">No soft_skills_school_scores data in bundle — run build_dashboard_data.py after generating that CSV.</td></tr>';
}

// ── SECTION 3: WORKFORCE ──────────────────────────────────────────────────────
function renderWorkforce(data) {
  // Nurses hired bar
  destroyChart('nurses');
  const sortedN = [...data].filter(d=>d.nurses>=5).sort((a,b)=>b.nurses-a.nurses).slice(0,12);
  charts['nurses'] = new Chart(document.getElementById('nursesChart').getContext('2d'), {
    type:'bar',
    data:{labels:sortedN.map(d=>shortName(d.school)),datasets:[{data:sortedN.map(d=>d.nurses),backgroundColor:sortedN.map(d=>schoolColor(d.school)+'bb'),borderColor:sortedN.map(d=>schoolColor(d.school)),borderWidth:1,borderRadius:4}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`Nurses hired: ${c.raw}`},backgroundColor:'#111827',borderColor:'#1e2d45',borderWidth:1,titleColor:'#fff',bodyColor:'#94a3b8',padding:10}},scales:{x:{grid:{color:'#1e2d45'},ticks:{color:'#64748b'}},y:{grid:{display:false},ticks:{color:'#94a3b8',font:{size:10}}}}}
  });

  // Tenure bar
  destroyChart('tenure');
  const tenureData = [...data].filter(d=>d.tenure&&d.nurses>=5).sort((a,b)=>b.tenure-a.tenure);
  charts['tenure'] = new Chart(document.getElementById('tenureChart').getContext('2d'), {
    type:'bar',
    data:{labels:tenureData.map(d=>shortName(d.school)),datasets:[{data:tenureData.map(d=>+d.tenure.toFixed(2)),backgroundColor:tenureData.map(d=>schoolColor(d.school)+'bb'),borderColor:tenureData.map(d=>schoolColor(d.school)),borderWidth:1,borderRadius:4}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`Avg tenure: ${c.raw} yrs`},backgroundColor:'#111827',borderColor:'#1e2d45',borderWidth:1,titleColor:'#fff',bodyColor:'#94a3b8',padding:10}},scales:{x:{min:0,grid:{color:'#1e2d45'},ticks:{color:'#64748b',callback:v=>v+' yr'}},y:{grid:{display:false},ticks:{color:'#94a3b8',font:{size:10}}}}}
  });

  // Unit grid
  const unitGrid = document.getElementById('unitGrid');
  const maxNurses = Math.max(...data.map(d=>d.nurses));
  unitGrid.innerHTML = [...data].filter(d=>d.nurses>=5).sort((a,b)=>b.nurses-a.nurses).map(d=>{
    const c = schoolColor(d.school);
    return `<div class="rotation-card">
      <div class="rotation-school" title="${toTitle(d.school)}">${toTitle(d.school)}</div>
      <div class="rotation-bar-bg"><div class="rotation-bar-fill" style="width:${(d.nurses/maxNurses*100).toFixed(0)}%;background:${c}"></div></div>
      <div class="rotation-stats">
        <div class="rotation-stat"><span>${d.nurses}</span> nurses</div>
        <div class="rotation-stat" style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.65rem" title="${d.unit}">${d.unit}</div>
      </div>
    </div>`;
  }).join('');

  // Term reason doughnut
  destroyChart('termReason');
  charts['termReason'] = new Chart(document.getElementById('termReasonChart').getContext('2d'), {
    type:'doughnut',
    data:{labels:termReasons.map(d=>d.reason),datasets:[{data:termReasons.map(d=>d.count),backgroundColor:palette.slice(0,termReasons.length).map(c=>c+'cc'),borderColor:palette.slice(0,termReasons.length),borderWidth:1}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{color:'#94a3b8',boxWidth:10,font:{size:10},padding:8}},tooltip:{callbacks:{label:c=>`${c.label}: ${c.raw} nurses`},backgroundColor:'#111827',borderColor:'#1e2d45',borderWidth:1,titleColor:'#fff',bodyColor:'#94a3b8',padding:10}}}
  });

  // Hires per year line
  destroyChart('hiresYear');
  const topSchools = [...data].filter(d=>d.nurses>=20).map(d=>d.school).slice(0,6);
  const years=[2022,2023,2024,2025];
  const hireDatasets = topSchools.map(school=>({
    label:toTitle(school),
    data:years.map(y=>{const r=byYearData.find(r=>r.school===school&&r.year===y);return r?r.nurses:null;}),
    borderColor:schoolColor(school),backgroundColor:schoolColor(school)+'22',
    borderWidth:1.5,pointRadius:4,tension:0.3,fill:false,spanGaps:true
  }));
  charts['hiresYear'] = new Chart(document.getElementById('hiresYearChart').getContext('2d'), {
    type:'line',data:{labels:years,datasets:hireDatasets},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#94a3b8',boxWidth:12,font:{size:11}}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${c.raw||'N/A'} nurses`},backgroundColor:'#111827',borderColor:'#1e2d45',borderWidth:1,titleColor:'#fff',bodyColor:'#94a3b8',padding:10}},scales:{x:{grid:{color:'#1e2d45'},ticks:{color:'#64748b'}},y:{grid:{color:'#1e2d45'},ticks:{color:'#64748b'}}}}
  });

  // Workforce table
  const tbody = document.getElementById('workforceTable');
  const maxN = Math.max(...data.map(d=>d.nurses));
  const sortedW = [...data].sort((a,b)=>b.nurses-a.nurses);
  tbody.innerHTML = sortedW.map(d=>{
    const workScore = d.tenure ? (d.nurses * d.tenure * d.retention).toFixed(1) : '—';
    return `<tr>
      <td class="school-name-cell">${toTitle(d.school)}</td>
      <td><div class="score-bar-wrap"><div class="score-bar"><div class="score-bar-fill" style="width:${(d.nurses/maxN*100).toFixed(0)}%;background:${schoolColor(d.school)}"></div></div><span style="font-family:var(--mono);font-size:0.78rem">${d.nurses}</span></div></td>
      <td style="font-family:var(--mono);font-size:0.82rem;color:var(--muted)">${d.tenure?d.tenure.toFixed(2)+'yr':'—'}</td>
      <td style="font-size:0.78rem;color:var(--muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${d.unit}">${d.unit}</td>
      <td style="font-size:0.75rem;color:var(--muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.termReason}</td>
      <td style="font-family:var(--mono);font-size:0.82rem;color:var(--accent2)">${workScore}</td>
    </tr>`;
  }).join('');
}

// ── SECTION 4: COMBINED ───────────────────────────────────────────────────────
function renderCombined(data) {
  // Best cards
  const scored = data.filter(d=>d.passRate&&d.nurses>=5)
    .map(d=>({...d,score:compositeScore(d)}))
    .sort((a,b)=>b.score-a.score).slice(0,3);
  document.getElementById('bestGrid').innerHTML = scored.map((d,i)=>`
    <div class="best-card">
      <div class="best-rank">${i+1}</div>
      <div class="best-school">${toTitle(d.school)}</div>
      <div class="best-metrics">
        <div class="best-metric"><span class="best-metric-label">PASS RATE</span><span class="best-metric-val val-blue">${d.passRate.toFixed(1)}%</span></div>
        <div class="best-metric"><span class="best-metric-label">RETENTION</span><span class="best-metric-val val-green">${pct(d.retention)}</span></div>
        <div class="best-metric"><span class="best-metric-label">NURSES HIRED</span><span class="best-metric-val val-gold">${d.nurses}</span></div>
        <div class="best-metric"><span class="best-metric-label">COMPOSITE SCORE</span><span class="best-metric-val val-purple">${d.score.toFixed(3)}</span></div>
      </div>
    </div>
  `).join('');

  // Scatter: pass vs retention
  destroyChart('scatter');
  const withBoth = data.filter(d=>d.passRate&&d.nurses>=3);
  const maxN = Math.max(...withBoth.map(d=>d.nurses));
  charts['scatter'] = new Chart(document.getElementById('scatterChart').getContext('2d'), {
    type:'bubble',
    data:{datasets:withBoth.map(d=>({label:toTitle(d.school),data:[{x:d.passRate,y:d.retention*100,r:Math.max(6,Math.sqrt(d.nurses/maxN)*36)}],backgroundColor:schoolColor(d.school)+'cc',borderColor:schoolColor(d.school),borderWidth:1.5}))},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>{const d=withBoth[c.datasetIndex];return[toTitle(d.school),`Pass: ${d.passRate.toFixed(1)}%`,`Retention: ${pct(d.retention)}`,`Nurses: ${d.nurses}`];}},backgroundColor:'#111827',borderColor:'#1e2d45',borderWidth:1,titleColor:'#fff',bodyColor:'#94a3b8',padding:12}},
      scales:{x:{title:{display:true,text:'NCLEX Pass Rate (%)',color:'#64748b',font:{size:11}},min:65,max:100,grid:{color:'#1e2d45'},ticks:{color:'#64748b'}},y:{title:{display:true,text:'Retention Rate (%)',color:'#64748b',font:{size:11}},min:40,max:105,grid:{color:'#1e2d45'},ticks:{color:'#64748b',callback:v=>v+'%'}}},
    },
    plugins:[{id:'quadrant',beforeDraw(chart){
      const {ctx,chartArea,scales}=chart;
      if(!chartArea)return;
      const xMid=scales.x.getPixelForValue(88),yMid=scales.y.getPixelForValue(70);
      ctx.save();
      ctx.fillStyle='rgba(16,185,129,0.04)';
      ctx.fillRect(xMid,chartArea.top,chartArea.right-xMid,yMid-chartArea.top);
      ctx.strokeStyle='rgba(100,116,139,0.3)';ctx.setLineDash([4,4]);ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(xMid,chartArea.top);ctx.lineTo(xMid,chartArea.bottom);ctx.stroke();
      ctx.beginPath();ctx.moveTo(chartArea.left,yMid);ctx.lineTo(chartArea.right,yMid);ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle='rgba(16,185,129,0.5)';ctx.font='10px DM Mono,monospace';
      ctx.fillText('BEST ZONE',xMid+6,chartArea.top+14);
      ctx.restore();
    }}]
  });

  // Scatter 2: pass vs tenure
  destroyChart('scatter2');
  const withTenure = data.filter(d=>d.passRate&&d.tenure&&d.nurses>=3);
  const maxN2 = Math.max(...withTenure.map(d=>d.nurses));
  charts['scatter2'] = new Chart(document.getElementById('scatter2Chart').getContext('2d'), {
    type:'bubble',
    data:{datasets:withTenure.map(d=>({label:toTitle(d.school),data:[{x:d.passRate,y:d.tenure,r:Math.max(6,Math.sqrt(d.nurses/maxN2)*32)}],backgroundColor:schoolColor(d.school)+'cc',borderColor:schoolColor(d.school),borderWidth:1.5}))},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>{const d=withTenure[c.datasetIndex];return[toTitle(d.school),`Pass: ${d.passRate.toFixed(1)}%`,`Tenure: ${d.tenure.toFixed(2)} yrs`,`Nurses: ${d.nurses}`];}},backgroundColor:'#111827',borderColor:'#1e2d45',borderWidth:1,titleColor:'#fff',bodyColor:'#94a3b8',padding:12}},
      scales:{x:{title:{display:true,text:'NCLEX Pass Rate (%)',color:'#64748b',font:{size:11}},min:65,max:100,grid:{color:'#1e2d45'},ticks:{color:'#64748b'}},y:{title:{display:true,text:'Avg Tenure (yrs)',color:'#64748b',font:{size:11}},grid:{color:'#1e2d45'},ticks:{color:'#64748b',callback:v=>v+' yr'}}},
    }
  });

  // Radar for top 5
  destroyChart('radar');
  const top5 = data.filter(d=>d.passRate&&d.nurses>=5)
    .map(d=>({...d,score:compositeScore(d)}))
    .sort((a,b)=>b.score-a.score).slice(0,5);
  if (top5.length >= 2) {
    const maxNurses=Math.max(...top5.map(d=>d.nurses));
    const maxTenure=Math.max(...top5.filter(d=>d.tenure).map(d=>d.tenure));
    charts['radar'] = new Chart(document.getElementById('radarChart').getContext('2d'), {
      type:'radar',
      data:{
        labels:['Pass Rate','Retention','Volume (nurses)','Tenure','Composite Score'],
        datasets:top5.map(d=>({
          label:toTitle(d.school),
          data:[
            d.passRate||0,
            d.retention*100,
            (d.nurses/maxNurses)*100,
            d.tenure?(d.tenure/maxTenure)*100:0,
            (d.score/compositeScore(top5[0]))*100
          ],
          borderColor:schoolColor(d.school),backgroundColor:schoolColor(d.school)+'22',borderWidth:1.5,pointRadius:3
        }))
      },
      options:{
        responsive:true,maintainAspectRatio:false,
        plugins:{legend:{labels:{color:'#94a3b8',boxWidth:12,font:{size:11}}},tooltip:{backgroundColor:'#111827',borderColor:'#1e2d45',borderWidth:1,titleColor:'#fff',bodyColor:'#94a3b8',padding:10}},
        scales:{r:{min:0,max:100,grid:{color:'#1e2d45'},ticks:{color:'#64748b',backdropColor:'transparent',font:{size:9}},pointLabels:{color:'#94a3b8',font:{size:11}}}}
      }
    });
  }

  // Z-score table
  const withZ = computeZScore(data);
  const sortedZ = [...withZ].sort((a,b)=>{
    if (a.zScore==null&&b.zScore==null) return 0;
    if (a.zScore==null) return 1;
    if (b.zScore==null) return -1;
    return b.zScore-a.zScore;
  });
  const maxNurses2 = Math.max(...sortedZ.map(d=>d.nurses));
  const tbody = document.getElementById('schoolTable');
  tbody.innerHTML = sortedZ.map((d,i)=>{
    const score = compositeScore(d);
    const tag = score>0.65?'<span class="tag tag-top">TOP PICK</span>':score>0.5?'<span class="tag tag-mid">PROMISING</span>':d.passRate?'<span class="tag tag-low">MONITOR</span>':'<span class="tag tag-na">LIMITED DATA</span>';
    const retColor = d.retention>=0.75?'#10b981':d.retention>=0.65?'#f59e0b':'#ef4444';
    const passColor = !d.passRate?'#64748b':d.passRate>=90?'#10b981':d.passRate>=80?'#f59e0b':'#ef4444';
    let zBadge = '—';
    if (d.zScore!=null) {
      const zColor = d.zScore>0.5?'rgba(16,185,129,0.15)':d.zScore>-0.5?'rgba(245,158,11,0.15)':'rgba(239,68,68,0.15)';
      const zText = d.zScore>0.5?'#10b981':d.zScore>-0.5?'#f59e0b':'#ef4444';
      const sign = d.zScore>0?'+':'';
      zBadge = `<span class="zscore-badge" style="background:${zColor};color:${zText}">${sign}${d.zScore.toFixed(2)}</span>`;
    }
    return `<tr onclick="selectSchool(${JSON.stringify(d.school)})" class="${selectedSchool===d.school?'selected':''}">
      <td style="font-family:var(--mono);font-size:0.75rem;color:var(--muted)">${d.zScore!=null?i+1:'—'}</td>
      <td class="school-name-cell">${toTitle(d.school)}</td>
      <td><div class="score-bar-wrap"><div class="score-bar"><div class="score-bar-fill" style="width:${(d.nurses/maxNurses2*100).toFixed(0)}%;background:${schoolColor(d.school)}"></div></div><span style="font-family:var(--mono);font-size:0.78rem">${d.nurses}</span></div></td>
      <td style="color:${retColor};font-family:var(--mono);font-size:0.82rem">${pct(d.retention)}</td>
      <td style="color:${passColor};font-family:var(--mono);font-size:0.82rem">${d.passRate?d.passRate.toFixed(1)+'%':'—'}</td>
      <td style="font-family:var(--mono);font-size:0.82rem;color:var(--muted)">${d.tenure?d.tenure.toFixed(2):'—'}</td>
      <td style="font-size:0.78rem;color:var(--muted);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${d.unit}">${d.unit}</td>
      <td>${zBadge}</td>
      <td>${tag}</td>
    </tr>`;
  }).join('');
}

function selectSchool(school) {
  selectedSchool = selectedSchool === school ? null : school;
  render();
}

window.addEventListener('DOMContentLoaded', init);
