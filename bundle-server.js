require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// Config
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_changeme';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'IAMADMIN';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname,'data','uploads');
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname,'data','reports.json');

fs.ensureDirSync(UPLOAD_DIR);
fs.ensureFileSync(DATA_FILE);

// Read source assets (if present) to inline
function readIf(filePath){ try { return fs.readFileSync(path.join(__dirname,filePath),'utf8'); } catch(e){ return null } }
const indexHtml = readIf('index.html') || '<!doctype html><html><body><h1>Index missing</h1></body></html>';
const aboutHtml = readIf('about.html') || '<!doctype html><html><body><h1>About missing</h1></body></html>';
const reportHtml = readIf('report.html') || '<!doctype html><html><body><h1>Report missing</h1></body></html>';
const adminHtml = readIf('admin.html') || '<!doctype html><html><body><h1>Admin missing</h1></body></html>';
const stylesCss = readIf('css/styles.css') || '';
const appJs = readIf('js/app.js') || '';
const logoSvg = readIf('assets/logo.svg') || '';

// Helper to inline css/js and svg into an HTML string (simple replacements)
function inlineAll(html){
  let out = html;
  // inline CSS link
  out = out.replace(/<link rel=["']stylesheet["'] href=["']css\/styles.css["']\/?>(\s*)/i, `<style>\n${stylesCss}\n</style>`);
  // inline JS script tag
  out = out.replace(/<script\s+src=["']js\/app.js["']><\/script>/i, `<script>\n${appJs}\n</script>`);
  // replace <img src="assets/logo.svg"...> with inline svg content
  if(logoSvg){
    out = out.replace(/<img\s+src=["']assets\/logo.svg["'][^>]*>/g, logoSvg);
  }
  return out;
}

const app = express();
app.use(cors());
app.use(express.json({limit:'10mb'}));
app.use(express.urlencoded({extended:true, limit:'10mb'}));

// multer for uploads
const storage = multer.diskStorage({ destination: (req, file, cb) => cb(null, UPLOAD_DIR), filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname)) });
const upload = multer({storage, limits: {fileSize: 10 * 1024 * 1024}});

function readReports(){ try{ return fs.readJsonSync(DATA_FILE); } catch(e){ return []; } }
function writeReports(arr){ fs.writeJsonSync(DATA_FILE, arr, {spaces:2}); }

const REDEEM_FILE = path.join(__dirname,'data','redemptions.json');
fs.ensureFileSync(REDEEM_FILE);
function readRedemptions(){ try{ return fs.readJsonSync(REDEEM_FILE); } catch(e){ return []; } }
function writeRedemptions(arr){ fs.writeJsonSync(REDEEM_FILE, arr, {spaces:2}); }

const REWARDS_CATALOG = [
  {id:'rw-1', name:'Sticker Pack', cost:200},
  {id:'rw-2', name:'Volunteer Voucher', cost:500},
  {id:'rw-3', name:'T-Shirt', cost:1200}
];

// rewards endpoints
app.get('/api/rewards', (req,res)=>{ res.json({rewards: REWARDS_CATALOG}); });

app.post('/api/redeem', (req,res)=>{
  try{
    const body = req.body || {};
    if(!body.userId || !body.rewardId) return res.status(400).json({error:'missing data'});
    const rewards = readRedemptions();
    const id = 'rd-' + Date.now();
    const entry = { id, userId: body.userId, rewardId: body.rewardId, rewardName: body.rewardName || '', cost: body.cost || 0, created: new Date().toISOString() };
    rewards.unshift(entry);
    writeRedemptions(rewards);
    res.json({success:true, redemption: entry});
  } catch(e){ console.error(e); res.status(500).json({error:'server error'}); }
});

let ADMIN_HASH = null;
(async ()=>{ ADMIN_HASH = await bcrypt.hash(ADMIN_PASS, 10); })();

// Serve inlined pages
app.get('/', (req,res)=> res.type('html').send(inlineAll(indexHtml)));
app.get('/about.html', (req,res)=> res.type('html').send(inlineAll(aboutHtml)));
app.get('/report.html', (req,res)=> res.type('html').send(inlineAll(reportHtml)));
app.get('/admin.html', (req,res)=> res.type('html').send(inlineAll(adminHtml)));

// Serve logo/svg if needed
app.get('/assets/logo.svg', (req,res)=>{
  if(logoSvg){ res.type('image/svg+xml').send(logoSvg); } else res.status(404).send('not found');
});

// API endpoints (same as earlier server)
app.post('/api/admin/login', async (req,res)=>{
  const {username, password} = req.body || {};
  if(username !== ADMIN_USER) return res.status(401).json({error:'invalid'});
  const ok = await bcrypt.compare(password, ADMIN_HASH);
  if(!ok) return res.status(401).json({error:'invalid'});
  const token = jwt.sign({sub: username}, JWT_SECRET, {expiresIn: '12h'});
  res.json({token});
});

function authMiddleware(req,res,next){ const h = req.headers.authorization || ''; const m = h.match(/^Bearer\s+(.+)$/i); if(!m) return res.status(401).json({error:'missing token'}); const token = m[1]; try{ const payload = jwt.verify(token, JWT_SECRET); req.user = payload; next(); } catch(e){ res.status(401).json({error:'invalid token'}); } }

app.post('/api/reports', upload.single('image'), async (req,res)=>{
  try{
    let imagePath = null;
    if(req.file){ imagePath = path.relative(__dirname, req.file.path).replace(/\\/g,'/'); }
    else if(req.body.captured){
      const m = req.body.captured.match(/^data:(image\/[^;]+);base64,(.+)$/);
      if(m){ const ext = m[1].split('/')[1] || 'jpg'; const data = Buffer.from(m[2],'base64'); const filename = uuidv4() + '.' + ext; const outPath = path.join(UPLOAD_DIR, filename); fs.writeFileSync(outPath, data); imagePath = path.relative(__dirname, outPath).replace(/\\/g,'/'); }
    }
    if(!imagePath) return res.status(400).json({error:'image required'});
    const reports = readReports(); const id = 's-' + Date.now(); const r = { id, created: new Date().toISOString(), location: req.body.location || '', description: req.body.description || '', imagePath, status: 'pending', verifiedAwarded: false }; reports.unshift(r); writeReports(reports); res.json({success:true, award:50, report:r});
  } catch(err){ console.error(err); res.status(500).json({error:'server error'}); }
});

app.get('/api/admin/reports', authMiddleware, (req,res)=>{ const reports = readReports(); res.json({reports}); });
app.post('/api/admin/reports/:id/verify', authMiddleware, (req,res)=>{ const id = req.params.id; const reports = readReports(); const idx = reports.findIndex(r=>r.id===id); if(idx === -1) return res.status(404).json({error:'not found'}); if(!reports[idx].verifiedAwarded){ reports[idx].verifiedAwarded = true; reports[idx].status = 'verified'; writeReports(reports); return res.json({success:true, award:100, report: reports[idx]}); } res.json({success:false, message:'already verified'}); });

app.listen(PORT, ()=> console.log('Bundle server listening on', PORT));
