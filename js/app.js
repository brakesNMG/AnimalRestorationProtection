// Global safety handlers to surface and prevent crashes
window.addEventListener('error', function(ev){
  console.error('Unhandled error:', ev.error || ev.message || ev);
});
window.addEventListener('unhandledrejection', function(ev){
  console.error('Unhandled promise rejection:', ev.reason);
});

try{
  function initApp(){
  // Simple client-side reward system using localStorage
  const POINTS_KEY = 'hr_points';
  const REPORTS_KEY = 'hr_reports';
  const BASE_AWARD = 50; // points for submitting photo evidence
  const VERIFY_AWARD = 100; // bonus when a report is verified (simulated)

  function qs(sel){return document.querySelector(sel)}

  function getPoints(){return Number(localStorage.getItem(POINTS_KEY) || 0)}
  function setPoints(n){localStorage.setItem(POINTS_KEY,String(n)); updatePointsDisplay()}

  function saveReport(report){
    try{
      const raw = localStorage.getItem(REPORTS_KEY) || '[]';
      const arr = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
      arr.unshift(report);
      localStorage.setItem(REPORTS_KEY, JSON.stringify(arr));
    } catch(e){ console.error('saveReport error', e); localStorage.setItem(REPORTS_KEY, JSON.stringify([report])); }
  }

  function loadReports(){
    try{ const v = JSON.parse(localStorage.getItem(REPORTS_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch(e){ console.error('loadReports parse error', e); return []; }
  }

  function updatePointsDisplay(){
    const el = qs('#points-balance strong');
    if(el) el.textContent = String(getPoints());
  }

  // Handle report form if present
  const form = qs('#report-form');
  if(form){
    const photoInput = qs('#photo');
    const preview = qs('#preview');

    const photoFilenameEl = qs('#photo-filename');
    const photoChooseBtn = qs('#photo-choose');
    // Fallback handling: some browsers may block programmatic input.click() when input
    // is visually hidden. We'll attempt native click first, and if that doesn't trigger
    // a change event, create a temporary visible input as a fallback.
    let tmpSelectedFile = null;
    if(photoChooseBtn && photoInput){
      photoChooseBtn.addEventListener('click', ()=>{
        try{
          let changed = false;
          const onChangeOnce = ()=>{ changed = true; photoInput.removeEventListener('change', onChangeOnce); };
          photoInput.addEventListener('change', onChangeOnce);
          photoInput.click();
          // if native click didn't open or change didn't occur soon, use a temp input
          setTimeout(()=>{
            if(changed) return;
            // create temporary input (visible) as fallback
            const tmp = document.createElement('input');
            tmp.type = 'file'; tmp.accept = photoInput.accept || 'image/*';
            tmp.style.position = 'fixed'; tmp.style.left = '50%'; tmp.style.top = '40%'; tmp.style.transform = 'translate(-50%,-50%)'; tmp.style.zIndex = '99999';
            document.body.appendChild(tmp);
            tmp.addEventListener('change', ()=>{
              const f = tmp.files && tmp.files[0];
              if(!f){ document.body.removeChild(tmp); return }
              tmpSelectedFile = f;
              if(photoFilenameEl) photoFilenameEl.textContent = f.name;
              const reader = new FileReader();
              reader.onload = function(e){ if(preview){ preview.setAttribute('aria-hidden','false'); preview.innerHTML = `<img src="${e.target.result}" alt="upload preview">`; } }
              reader.readAsDataURL(f);
              // cleanup
              setTimeout(()=>{ try{ document.body.removeChild(tmp); } catch(e){} }, 300);
            });
            tmp.click();
          }, 250);
        } catch(e){ console.error('photoChoose click error', e); }
      });
    }

    if(photoInput){
      photoInput.addEventListener('change', ()=>{
        // clear any tmpSelectedFile if native input used
        tmpSelectedFile = null;
        const f = photoInput.files && photoInput.files[0];
        if(!f) { if(preview){ preview.innerHTML=''; preview.setAttribute('aria-hidden','true'); } if(photoFilenameEl) photoFilenameEl.textContent = 'No file chosen'; return }
        if(photoFilenameEl) photoFilenameEl.textContent = f.name;
        const reader = new FileReader();
        reader.onload = function(e){ if(preview){ preview.setAttribute('aria-hidden','false'); preview.innerHTML = `<img src="${e.target.result}" alt="upload preview">`; } }
        reader.readAsDataURL(f);
      });
    }

    form.addEventListener('submit', (ev)=>{
      ev.preventDefault();
      const loc = qs('#location').value.trim();
      if(!loc){ alert('Please provide the location of the sighting.'); return }
      const desc = qs('#description').value.trim();
      const file = (photoInput.files && photoInput.files[0]) || tmpSelectedFile;
      if(!file){ alert('Please attach a photo.'); return }

      function finalize(imageData){
        const id = 'r-' + Date.now();
        const report = {
          id,
          created: new Date().toISOString(),
          location: loc,
          description: desc,
          imageData: imageData,
          status: 'pending',
          awarded: true
        };
        // Try to submit to server; if server reachable, send FormData, otherwise fallback to localStorage
        (async function(){
          try{
            const payload = new FormData();
            payload.append('location', report.location || '');
            payload.append('description', report.description || '');
            // convert dataURL to blob
            const res = await fetch(report.imageData);
            const blob = await res.blob();
            payload.append('image', blob, 'evidence.jpg');
            const r = await fetch('/api/reports', {method:'POST', body: payload});
            if(r.ok){
              const body = await r.json();
              setPoints( getPoints() + (body.award || BASE_AWARD) );
              // save server report locally for quick access
              const saved = body.report; saved.imageData = (saved.imagePath ? saved.imagePath : report.imageData);
              saveReport(saved);
              renderReports();
              alert('Report submitted to server — points awarded. Thank you.');
              return;
            }
          }catch(e){ /* server not available, fallback */ }
          // fallback local
          saveReport(report);
          setPoints( getPoints() + BASE_AWARD );
          renderReports();
          alert('Report saved locally — ' + BASE_AWARD + ' points awarded.');
        })();
        form.reset();
        if(preview){ preview.innerHTML = ''; preview.setAttribute('aria-hidden','true'); }
        alert('Report submitted — ' + BASE_AWARD + ' points awarded. Thank you.');
      }

      // proceed with file reader flow

      const reader = new FileReader();
      reader.onload = function(e){ finalize(e.target.result); }
      reader.readAsDataURL(file);
    });
  }

  // Tab controller: separate Report form and My Reports into distinct tabs
  (function initTabs(){
    const btns = Array.from(document.querySelectorAll('.tab-btn'));
    const panelForm = qs('#tab-form');
    const panelReports = qs('#tab-reports');
    function select(name){
      try{
        btns.forEach(b=> b.classList.toggle('active', b.dataset.tab === name));
        if(panelForm) panelForm.classList.toggle('active', name === 'form');
        if(panelReports) panelReports.classList.toggle('active', name === 'reports');
      } catch(e){ console.error('tab select error', e); }
    }
    btns.forEach(b=> b.addEventListener('click', ()=> select(b.dataset.tab)));
    // initial selection: if URL hash is #my-reports, show reports tab
    if(location.hash === '#my-reports') select('reports'); else select('form');
    // keep URL hash in sync when switching to reports
    window.addEventListener('hashchange', ()=>{ if(location.hash === '#my-reports') select('reports'); });
  })();

  // Render stored reports with simulated verification option
  function renderReports(){
    const container = qs('#reports-list');
    if(!container) return;
    const reports = loadReports();
    if(reports.length === 0){ container.innerHTML = '<p>No reports yet.</p>'; return }
    container.innerHTML = '';
    reports.forEach(r => {
      const div = document.createElement('div');
      div.className = 'report-item';
      div.innerHTML = `
        <div class="report-thumb"><img src="${r.imageData}" alt="report image"></div>
        <div class="report-body">
          <div class="report-meta"><strong>${r.location || 'Unknown location'}</strong> • <small>${new Date(r.created).toLocaleString()}</small></div>
          <p>${r.description || ''}</p>
          <div class="report-actions">Status: <em>${r.status}</em>
            ${r.status !== 'verified' ? '<button data-id="'+r.id+'" class="btn small verify">Simulate Verify</button>' : ''}
          </div>
        </div>
      `;
      container.appendChild(div);
    });

    // wire verify buttons
    container.querySelectorAll('button.verify').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.getAttribute('data-id');
        const reports = loadReports();
        const idx = reports.findIndex(x=>x.id===id);
        if(idx === -1) return;
        if(reports[idx].status === 'verified') return;
        reports[idx].status = 'verified';
        // award verification bonus only once
        if(!reports[idx].verifiedAwarded){
          reports[idx].verifiedAwarded = true;
          setPoints( getPoints() + VERIFY_AWARD );
          alert('Report verified — bonus ' + VERIFY_AWARD + ' points awarded.');
        }
        localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
        renderReports();
      })
    })
  }

  // initial run
  updatePointsDisplay();
  renderReports();

  // expose for debugging
  window.HR = {getPoints, setPoints, loadReports, saveReport};

  // Rewards system
  const REWARDS_KEY = 'hr_redemptions';
  const USER_ID_KEY = 'hr_user_id';
  const REWARDS_CATALOG = [
    {id:'rw-1', name: 'Conservation Sticker Pack', cost: 150, desc: 'A set of wildlife-protection stickers.'},
    {id:'rw-2', name: 'Volunteer Voucher', cost: 400, desc: 'Priority spot at one local volunteer event.'},
    {id:'rw-3', name: 'Field Guide', cost: 900, desc: 'A pocket guide to local wildlife species.'}
  ];

  function getUserId(){
    let id = localStorage.getItem(USER_ID_KEY);
    if(!id){ id = 'u-' + Date.now() + '-' + Math.random().toString(36).slice(2,9); localStorage.setItem(USER_ID_KEY,id); }
    return id;
  }

  function getRedemptions(){ try{ const v = JSON.parse(localStorage.getItem(REWARDS_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch(e){ console.error('getRedemptions parse error', e); return []; } }
  function saveRedemption(r){ try{ const arr = getRedemptions(); arr.unshift(r); localStorage.setItem(REWARDS_KEY, JSON.stringify(arr)); } catch(e){ console.error('saveRedemption error', e); localStorage.setItem(REWARDS_KEY, JSON.stringify([r])); } }

  async function tryServerRedeem(payload){
    try{
      const res = await fetch('/api/redeem', {method:'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)});
      if(!res.ok) throw new Error('server');
      return await res.json();
    } catch(e){ return null; }
  }

  function renderRewards(){
    const grid = qs('#rewards-grid');
    if(!grid) return;
    grid.innerHTML = '';
    REWARDS_CATALOG.forEach(r=>{
      const a = document.createElement('div');
      a.className = 'reward-card';
      a.innerHTML = `<h3>${r.name}</h3><p class="muted">${r.desc}</p><p>Cost: <strong>${r.cost}</strong> pts</p><p><button class="btn redeem" data-id="${r.id}">Redeem</button></p>`;
      grid.appendChild(a);
    });
    grid.querySelectorAll('button.redeem').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id = btn.getAttribute('data-id');
        const reward = REWARDS_CATALOG.find(x=>x.id===id); if(!reward) return;
        if(getPoints() < reward.cost){ alert('Not enough points to redeem this reward.'); return }
        // deduct points
        setPoints( getPoints() - reward.cost );
        const redemption = { id: 'rd-'+Date.now(), userId: getUserId(), rewardId: reward.id, rewardName: reward.name, cost: reward.cost, created: new Date().toISOString(), synced:false };
        saveRedemption(redemption);
        renderRedemptions();
        // try to persist to server
        const srv = await tryServerRedeem(redemption);
        if(srv && srv.success){
          redemption.synced = true;
          localStorage.setItem(REWARDS_KEY, JSON.stringify(getRedemptions().map(r=> r.id===redemption.id ? redemption : r)));
          alert('Reward redeemed — server recorded the redemption.');
        } else {
          alert('Reward redeemed locally. It will be synced when a server is available.');
        }
      })
    })
  }

  function renderRedemptions(){
    const list = qs('#redemptions-list');
    if(!list) return;
    const arr = getRedemptions();
    if(arr.length===0){ list.innerHTML = '<p>No redemptions yet.</p>'; return }
    list.innerHTML = '';
    arr.forEach(r=>{
      const d = document.createElement('div'); d.className='report-item'; d.innerHTML = `<div class="report-body"><div class="report-meta"><strong>${r.rewardName}</strong> • <small>${new Date(r.created).toLocaleString()}</small></div><p>Cost: ${r.cost} pts ${r.synced?'<em>(synced)</em>':'<em>(local)</em>'}</p></div>`; list.appendChild(d);
    });
  }

  // initialize rewards page if present
  document.addEventListener('DOMContentLoaded', ()=>{
    try{ updatePointsDisplay(); renderRewards(); renderRedemptions(); } catch(e){ console.error('DOMContentLoaded handlers error', e); }
  });

  // Admin modal (hidden access): click logo 5x or press Ctrl+Shift+A
  (function(){
    let clicks = 0, t = null;
    const LOG_CLICK_THRESHOLD = 5;
    const RESET_MS = 2500;

    function resetClicks(){ clicks = 0; if(t){ clearTimeout(t); t=null; } }

    function showAdminModal(){
      if(document.getElementById('admin-modal')) return;
      const modal = document.createElement('div'); modal.id='admin-modal'; modal.className='admin-modal';
      modal.innerHTML = `
        <div class="admin-dialog">
          <h3>Administrator</h3>
          <p class="muted">Enter the secret admin code to view submissions.</p>
          <input id="admin-pass-input" type="password" placeholder="secret admin code">
          <div style="margin-top:.6rem"><button id="admin-modal-login" class="btn">Unlock</button> <button id="admin-modal-close" class="btn small">Close</button></div>
        </div>`;
      document.body.appendChild(modal);
      document.getElementById('admin-modal-close').addEventListener('click', ()=>{ modal.remove(); });
      document.getElementById('admin-modal-login').addEventListener('click', async ()=>{
        const pass = document.getElementById('admin-pass-input').value || '';
        try{
          const res = await fetch('/api/admin/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username:'admin', password: pass})});
          if(res.ok){
            const body = await res.json();
            sessionStorage.setItem('hr_admin_token', body.token);
            modal.remove();
            // navigate to admin page when server is available
            try{ window.location.href = '/admin.html'; } catch(e){ /* ignore */ }
            return;
          }
          // show server-provided error if available
          let msg = 'Login failed';
          try{
            const j = await res.json(); msg = j.error || j.message || JSON.stringify(j);
          } catch(_){ try{ msg = await res.text(); } catch(e){ msg = String(res.status); } }
          alert(msg || 'Login failed');
        } catch(err){
          // network error: offer local dev fallback (NOT secure)
          console.error('Admin login error', err);
          if(confirm('Server unreachable. Use local development fallback? This is insecure.')){
            const entered = document.getElementById('admin-pass-input').value || '';
            if(entered === 'IAMADMIN'){
              sessionStorage.setItem('hr_admin_token', 'localdev');
              modal.remove();
              // open inline local admin panel to avoid redirect issues
              openLocalAdminPanel();
            } else {
              alert('Local fallback failed: incorrect code');
            }
          } else {
            alert('Login error: ' + (err && err.message ? err.message : 'network error'));
          }
        }
      });
    }

    function openLocalAdminPanel(){
      try{
        if(document.getElementById('local-admin-panel')) return;
        const reports = (window.HR && window.HR.loadReports) ? window.HR.loadReports() : [];
        const modal = document.createElement('div'); modal.id='local-admin-panel'; modal.className='admin-modal';
        const listHtml = reports.map(r=>{
          const img = r.imageData ? `<div class="report-thumb"><img src="${r.imageData}" alt="report"></div>` : '';
          return `<div class="report-item">${img}<div class="report-body"><div class="report-meta"><strong>${r.location || 'Unknown'}</strong> • <small>${new Date(r.created).toLocaleString()}</small></div><p>${r.description||''}</p><div class="report-actions">Status: <em>${r.status}</em> ${r.status !== 'verified' ? '<button data-id="'+r.id+'" class="btn small local-verify">Verify</button>' : ''}</div></div></div>`;
        }).join('') || '<p>No reports available.</p>';
        modal.innerHTML = `<div class="admin-dialog"><h3>Local Admin (offline)</h3><div id="local-admin-list">${listHtml}</div><div style="margin-top:.6rem"><button id="local-admin-close" class="btn small">Close</button></div></div>`;
        document.body.appendChild(modal);
        document.getElementById('local-admin-close').addEventListener('click', ()=>{ modal.remove(); });
        // wire verify buttons
        modal.querySelectorAll('button.local-verify').forEach(btn=>{
          btn.addEventListener('click', ()=>{
            const id = btn.getAttribute('data-id');
            const reps = (window.HR && window.HR.loadReports) ? window.HR.loadReports() : [];
            const idx = reps.findIndex(x=>x.id===id);
            if(idx===-1) return;
            if(reps[idx].status !== 'verified'){
              reps[idx].status = 'verified';
              if(!reps[idx].verifiedAwarded){ reps[idx].verifiedAwarded = true; window.HR.setPoints(window.HR.getPoints() + 100); }
              localStorage.setItem('hr_reports', JSON.stringify(reps));
            }
            // refresh list
            const list = modal.querySelector('#local-admin-list');
            if(list) list.innerHTML = reps.map(r=>{ const img = r.imageData ? `<div class="report-thumb"><img src="${r.imageData}" alt="report"></div>` : ''; return `<div class="report-item">${img}<div class="report-body"><div class="report-meta"><strong>${r.location || 'Unknown'}</strong> • <small>${new Date(r.created).toLocaleString()}</small></div><p>${r.description||''}</p><div class="report-actions">Status: <em>${r.status}</em></div></div></div>`; }).join('');
        })
      } catch(e){ console.error('openLocalAdminPanel error', e); }
    }

    // (No keyboard shortcut) admin modal opens only via logo clicks

    // brand-specific click handler: prevent default, allow single-click navigation,
    // and open admin modal after LOG_CLICK_THRESHOLD rapid clicks
    try{
      const brandEl = document.querySelector('.brand');
      if(brandEl){
        brandEl.addEventListener('click', (ev)=>{
          try{
            ev.preventDefault();
            clicks++;
            if(t) clearTimeout(t);
            if(clicks >= LOG_CLICK_THRESHOLD){ resetClicks(); showAdminModal(); return; }
            t = setTimeout(()=>{
              try{ if(clicks < LOG_CLICK_THRESHOLD){ const href = brandEl.getAttribute('href') || '/'; window.location.href = href; } } catch(e){ console.error('brand click navigate error', e); }
              resetClicks();
            }, 500);
          } catch(e){ console.error('brand click handler error', e); }
        });
      }
    } catch(e){ console.error('brand handler init error', e); }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

} catch(e){
  console.error('App init error', e);
}
