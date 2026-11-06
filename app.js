import { publicApi as api } from './catalog-data.js';
const app=document.querySelector('#app'),search=document.querySelector('#search');
const publicEdition=document.documentElement.hasAttribute('data-public-edition');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const imageUrl=url=>'/api/image?url='+encodeURIComponent(url);
function getStore(k,d){try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}}
let shelf=getStore('manyu-real-shelf',[]),history=getStore('manyu-real-history',{});if(!Array.isArray(shelf))shelf=[];if(!history||Array.isArray(history)||typeof history!=='object')history={};
let chapterQuery='',routeController=null,progressTimer=null;
let activeGenre='全部',catalogData=null,currentBook=null,readerData=null,chapterLimit=60,reverse=false,version=0;
function save(){try{localStorage.setItem('manyu-real-shelf',JSON.stringify(shelf));localStorage.setItem('manyu-real-history',JSON.stringify(history))}catch{toast('当前浏览器未允许保存阅读记录')}}
function toast(t){const el=document.querySelector('#toast');el.textContent=t;el.classList.add('show');clearTimeout(el.timer);el.timer=setTimeout(()=>el.classList.remove('show'),2800)}
const routeLink=(name,params={})=>'#'+name+'?'+new URLSearchParams(params);
const readLink=(book,ch)=>routeLink('read',{book:book.url,chapter:ch.url});
const bookLink=b=>publicEdition?originalUrl(b.externalUrl||b.bookUrl||b.url):routeLink('book',{url:b.bookUrl||b.url});
const genreMap=g=>({'愛情':'恋爱','奇幻冒險':'奇幻','歐式宮廷':'宫廷','武俠':'武侠','校園':'校园','驚悚':'悬疑','動作':'动作','現代/職場':'职场','影視化':'影视化'}[g]||g||'漫画');
const platforms={
  webtoon:{name:'WEBTOON',language:'繁体中文',host:'www.webtoons.com'},
  'webtoon-en':{name:'WEBTOON',language:'英文',host:'www.webtoons.com'},
  'webtoon-fr':{name:'WEBTOON',language:'法文',host:'www.webtoons.com'},
  dongman:{name:'咚漫漫画',language:'简体中文',host:'www.dongmanmanhua.cn'},
  kuaikan:{name:'快看漫画',language:'简体中文',host:'www.kuaikanmanhua.com'},
  naver:{name:'NAVER WEBTOON',language:'韩文',host:'comic.naver.com'},
};
const platformFor=b=>platforms[b.provider]||platforms.webtoon;
const platformName=b=>platformFor(b).name;
const originalHosts=new Set([...Object.values(platforms).map(platform=>platform.host),'manta.net','www.tappytoon.com','ridibooks.com']);
function originalUrl(value){
  if(!value)return '';
  try {
    const url=new URL(value,'https://www.webtoons.com');
    if(url.protocol==='https:'&&!url.port&&!url.username&&!url.password&&originalHosts.has(url.hostname))return url.href;
  } catch {}
  return '';
}
function card(b){
  const title=b.bookTitle||b.title,platform=platformFor(b),external=publicEdition||b.availability==='external';
  const href=external?originalUrl(b.externalUrl||b.bookUrl||b.url):bookLink(b);
  const subtitle=history[b.id]?'读至 '+history[b.id].title:platform.language+' · '+platform.name;
  const genre=b.originKnown?'已标注韩漫':b.originKnown===false?'产地待核对':genreMap(b.genre);
  const cover=b.cover&&!publicEdition
    ? `<img src="${esc(imageUrl(b.cover))}" alt="${esc(title)}封面" loading="lazy">`
    : `<div class="cover-placeholder" aria-hidden="true"><span>漫屿 · 作品目录</span><strong>${esc(title)}</strong></div>`;
  const onShelf=location.hash.startsWith('#shelf');
  const saved=shelf.some(item=>item.id===b.id);
  const favorite=publicEdition&&!onShelf?`<button class="chip public-favorite" data-favorite="${esc(JSON.stringify({id:b.id,title,url:href,provider:b.provider,genre:b.genre}))}" aria-pressed="${saved}">${saved?'已收藏':'收藏'}</button>`:'';
  return `<div class="shelf-item"><a class="book" href="${esc(href)}" ${external?'target="_blank" rel="noopener noreferrer"':''}><div class="cover">${cover}<span class="badge">${esc(genre)}</span><span class="cover-bottom">${esc(subtitle)}</span></div><h3>${esc(title)}</h3><div class="book-meta"><span>${external?(b.access||(publicEdition?(mainlandPlatforms.has(b.provider)?'中国大陆平台':'海外平台'):'平台作品页')):'站内读公开章'}</span><span>${external?'原站阅读 ↗':'章节 / 下载 →'}</span></div></a>${onShelf?`<button class="remove-book" data-remove-id="${esc(b.id)}" aria-label="移除${esc(title)}">×</button>`:favorite}</div>`;
}
const mainlandPlatforms=new Set(['kuaikan','dongman']);
const mainlandReading={
  '某天成为公主':{platform:'快看 简体中文',url:'https://www.kuaikanmanhua.com/web/topic/2991/'},
  '我独自升级':{platform:'快看 简体中文',url:'https://www.kuaikanmanhua.com/web/topic/4319/'},
  '反转练习生':{platform:'咚漫 简体中文',url:'https://www.dongmanmanhua.cn/FANTASY/fanzhuanlianxisheng/list?title_no=2795'},
};
function mainlandFirstGuide(guide){
  const local=mainlandReading[guide?.title];
  if(!local)return guide;
  const url=originalUrl(local.url);
  const editions=guide.editions.filter(edition=>originalUrl(edition.externalUrl||edition.url)!==url);
  return {...guide,note:'中国大陆读者可先打开快看或咚漫。其他版本的网络和解锁要求以各原站为准。',editions:[
    {title:guide.title,platform:local.platform,externalUrl:url,access:'中国大陆官方入口',
      note:'可阅读的章节、免费范围和是否需要 App 以原站提示为准。'},
    ...editions,
  ]};
}
function readingGuide(guide){
  if(publicEdition)guide=mainlandFirstGuide(guide);
  if(!guide)return '';
  return `<section class="edition-links reading-guide"><h2>${esc(guide.title)} · 免费阅读入口</h2>
    <p>${esc(guide.note)}</p><ul>${guide.editions.map(edition=>{
      const external=publicEdition||Boolean(edition.externalUrl);
      const url=external?originalUrl(edition.externalUrl||edition.url):bookLink(edition);
      const access=publicEdition?edition.access.replace('站内读公开章','原站读公开章'):edition.access;
      const note=publicEdition?edition.note.replace('站内章节目录','官方章节目录'):edition.note;
      return `<li><a href="${esc(url)}" ${external?'target="_blank" rel="noopener noreferrer"':''}>${esc(edition.platform)} · ${esc(edition.title)} <span>${external?'↗':'→'}</span></a>
        <strong>${esc(access)}</strong><p>${esc(note)}</p></li>`;
    }).join('')}</ul></section>`;
}
function showDirectory(data,params){
  const {books,page,total,hasNextPage,counts,unavailable,providers,guide,matchCounts}=data;
  const orderedBooks=publicEdition?[...books].sort((a,b)=>Number(mainlandPlatforms.has(b.provider))-Number(mainlandPlatforms.has(a.provider))):books;
  const query=params.get('q')||'';
  const option=(name,value,label)=>`<option value="${esc(value)}" ${params.get(name)===value?'selected':''}>${esc(label)}</option>`;
  const pageLink=number=>{const next=new URLSearchParams(params);next.set('page',number);return routeLink('library',next)};
  const sourceLinks=Object.entries(providers).map(([id,p])=>`<a href="${esc(originalUrl(p.homepage))}" target="_blank" rel="noopener noreferrer">${esc(p.name)}${Object.hasOwn(counts,id)?' · '+counts[id].toLocaleString('zh-CN')+' 条':''} ↗</a>`).join('');
  const platformLink=id=>{
    const next=new URLSearchParams(params);
    next.delete('page');
    if(id==='all')next.delete('provider');
    else next.set('provider',id);
    return routeLink('library',next);
  };
  const matchedPlatforms=query?Object.entries(matchCounts).map(([id,count])=>
    `<a href="${esc(platformLink(id))}">${esc(providers[id].language)} · ${esc(providers[id].name)} ${count} 条</a>`).join(''):'';
  app.innerHTML=`<div class="eyebrow">MANHWA LIBRARY</div><h1 class="page-title">${query?'「'+esc(query)+'」的搜索结果':'韩漫与多语言书库'}</h1>
    <p class="subtitle">${publicEdition?'中国大陆读者可优先查看快看和咚漫。作品页会跳到官方平台，是否需要 App 或解锁以原站提示为准。':'想直接免费看，可选「站内读公开章」。同一作品各语言版开放的章节可能不同。'}</p>
    ${publicEdition?`<div class="directory-sources" aria-label="中国大陆平台"><a href="${esc(platformLink('kuaikan'))}">优先查看快看 →</a><a href="${esc(platformLink('dongman'))}">优先查看咚漫 →</a></div>`:''}
    ${readingGuide(guide)}
    ${query&&(matchedPlatforms||params.has('provider'))?`<div class="directory-sources" aria-label="按匹配版本筛选">
      ${params.get('provider')&&params.get('provider')!=='all'?`<a href="${esc(platformLink('all'))}">查看所有平台匹配 →</a>`:''}
      ${matchedPlatforms}</div>`:''}
    <form class="directory-filters" id="directory-filters">
      <label>平台<select name="provider">${option('provider','all','全部平台')}${Object.entries(providers).map(([id,p])=>option('provider',id,p.name)).join('')}</select></label>
      <label>产地<select name="origin">${option('origin','all','包含产地待核对')}${option('origin','kr','已标注韩漫')}</select></label>
      ${publicEdition?'':`<label>阅读方式<select name="availability">${option('availability','all','全部阅读方式')}${option('availability','reader','站内读公开章 / 按章下载')}${option('availability','external','前往原站查看章节')}</select></label>`}
      <button class="primary" type="submit">应用筛选</button>
    </form>
    <div class="directory-sources" aria-label="原站入口">${sourceLinks}</div>
    ${unavailable.length?`<p class="demo-note">暂时未能加载 ${esc(unavailable.join('、'))}。以下为已获取结果。<button class="secondary" type="button" data-retry>重试</button></p>`:''}
    <p class="source-caption">当前结果 ${total.toLocaleString('zh-CN')} 条 · 同一作品可能在多个平台出现。公开章节以来源实际提供为准。</p>
    ${books.length?`<div class="grid">${orderedBooks.map(card).join('')}</div>`:`<div class="empty"><h3>这一页没有作品</h3><p>可以换个译名或原名，或放宽筛选条件。</p><a class="secondary" href="#library">返回全部目录</a></div>`}
    ${page>1||hasNextPage?`<nav class="directory-pages" aria-label="书库分页">${page>1?`<a class="secondary" href="${esc(pageLink(page-1))}">← 上一页</a>`:''}<span>第 ${page} 页</span>${hasNextPage?`<a class="secondary" href="${esc(pageLink(page+1))}">下一页 →</a>`:''}</nav>`:''}`;
}
function rankingRow(book){
  const external=(publicEdition||book.availability==='external')&&!book.guideTitle;
  const url=book.guideTitle?routeLink('library',{q:book.guideTitle}):external?originalUrl(book.externalUrl):bookLink(book);
  const cover=book.cover&&!publicEdition?`<img src="${esc(imageUrl(book.cover))}" alt="" loading="lazy">`:
    '<span class="ranking-no-cover" aria-hidden="true">漫</span>';
  const details=[genreMap(book.genre),book.metric,book.guideTitle?'查看免费阅读入口':external?'原站查看章节':'公开章可站内读'].filter(Boolean).join(' · ');
  return `<li value="${book.rank}"><a href="${esc(url)}" ${external?'target="_blank" rel="noopener noreferrer"':''}>
    <span class="rank-number" aria-label="原榜第 ${book.rank} 名">${String(book.rank).padStart(2,'0')}</span>${cover}
    <span class="ranking-book-title"><strong>${esc(book.title)}</strong><small>${esc(details)}</small></span>
    <span class="ranking-arrow" aria-hidden="true">${external?'↗':'→'}</span></a></li>`;
}
function showRankings({boards},boardId){
  const selected=boards.find(board=>board.id===boardId);
  const link=id=>routeLink('ranking',{board:id});
  const available=boards.filter(board=>!board.unavailable);
  const total=available.reduce((count,board)=>count+board.books.length,0);
  const renderBoard=board=>{
    const updated=board.updatedAt?new Date(board.updatedAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
    return `<section class="ranking-board">
      <div class="ranking-board-head"><div><h2>${esc(board.label)}</h2><p>${board.unavailable?'本次未能获取':esc(board.books.length+' 条 · '+updated+' 获取')}</p></div>
      <a href="${esc(originalUrl(board.url))}" target="_blank" rel="noopener noreferrer">原榜 ↗</a></div>
      ${board.unavailable?'<p class="subtitle">可以打开原榜查看，或刷新后重试。</p>':
        `<ol>${(selected?board.books:board.books.slice(0,5)).map(rankingRow).join('')}</ol>
        ${!selected&&board.books.length>5?`<a class="ranking-more" href="${esc(link(board.id))}">查看全部 ${board.books.length} 条 →</a>`:''}`}
    </section>`;
  };
  app.innerHTML=`<div class="eyebrow">OFFICIAL CHARTS</div><h1 class="page-title">漫画人气榜</h1>
    <p class="subtitle">${available.length} 个官方榜单 · ${total} 个上榜条目。各榜保留原站名次，同一作品可能在多个榜单出现。</p>
    <div class="ranking-toolbar">
      <nav aria-label="选择榜单"><a href="#ranking" class="chip ${selected?'':'active'}" ${selected?'':'aria-current="page"'}>榜单总览</a>
      ${boards.map(board=>`<a href="${esc(link(board.id))}" class="chip ${board===selected?'active':''}" ${board===selected?'aria-current="page"':''}>${esc(board.label)}</a>`).join('')}</nav>
      <button class="secondary" data-refresh>重新加载 ↻</button>
    </div>
    <p class="source-caption">快看为韩漫专榜，其余榜单按原站范围展示。排名与免费阅读范围由各平台更新。</p>
    <div class="ranking-grid ${selected?'ranking-single':''}">${(selected?[selected]:boards).map(renderBoard).join('')}</div>`;
}
function editionLinks(book) {
  if(!book)return '';
  const links=(book.versions||[]).map(version=>{
    const external=Boolean(version.externalUrl);
    const url=external?originalUrl(version.externalUrl):bookLink(version);
    return `<a href="${esc(url)}" ${external?'target="_blank" rel="noopener noreferrer"':''}>${esc(version.platform)} · ${esc(version.title)} ${external?'↗':'→'}</a>`;
  }).join('');
  return `<div class="edition-links"><strong>找同一作品的其他版本</strong><div class="directory-sources">${links}<a href="${esc(routeLink('library',{q:book.title}))}">在书库搜索 →</a></div></div>`;
}
function errorView(e,source,book){return `<section class="empty"><h3>这一页暂时打不开</h3><p>${esc(e.message)}</p><button class="primary" data-retry>重新加载 ↻</button>${source?'<p><a href="'+esc(source)+'" target="_blank" rel="noopener noreferrer">打开原站页面 ↗</a></p>':''}${editionLinks(book)}</section>`}
function showPublicHome(books){
  app.innerHTML=`<section class="hero public-hero"><div class="hero-copy"><div class="eyebrow">MAN YU · MANHWA DIRECTORY</div>
    <h1>发现热门韩漫</h1><p>用熟悉的译名查找中文、英文和韩文官方版本，查看公开章、试读和等免入口。</p>
    <div class="hero-buttons"><a class="primary" href="#library">浏览书库 →</a><a class="plain" href="#ranking">查看人气榜 →</a></div>
  </div></section><div class="section-head"><h2>热门作品<small>OFFICIAL EDITIONS</small></h2></div>
  <div class="grid">${books.slice(0,12).map(card).join('')}</div>`;
}
function showPublicLink(source){
  app.innerHTML=`<section class="empty"><h3>到官方平台阅读</h3><p>章节和离线阅读由原站提供。</p>
    ${source?`<a class="primary" href="${esc(source)}" target="_blank" rel="noopener noreferrer">打开原站 ↗</a>`:''}
    <a class="plain" href="#library">回到漫屿书库 →</a></section>`;
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-favorite]');
  if(!button)return;
  const item=JSON.parse(button.dataset.favorite);
  const saved=shelf.some(book=>book.id===item.id);
  shelf=saved?shelf.filter(book=>book.id!==item.id):[...shelf,item];
  save();
  button.setAttribute('aria-pressed',String(!saved));
  button.textContent=saved?'收藏':'已收藏';
});
function showCatalog(){const {books,source,updatedAt}=catalogData;const groups=['全部',...new Set(books.map(b=>genreMap(b.genre)))],list=books.filter(b=>activeGenre==='全部'||genreMap(b.genre)===activeGenre),page=location.hash.slice(1).split('?')[0]||'home',featured=books[0];
const hero=featured?`<section class="hero live-hero"><div class="hero-copy"><div class="eyebrow">REAL STORIES, YOUR LITTLE ESCAPE</div><h1>热门韩漫，<br>打开就读。</h1><p>在熟悉的故事里，发现新的心动。<br>真实作品 · 多语言公开章 · 按需下载</p><div class="hero-buttons"><a class="primary" href="${esc(bookLink(featured))}">探索热门作品 ↗</a><a class="plain" href="#library">浏览全部 →</a></div></div><div class="hero-collage">${books.slice(0,3).map(b=>`<a href="${esc(bookLink(b))}"><img src="${esc(imageUrl(b.cover))}" alt="${esc(b.title)}"></a>`).join('')}</div></section><div class="intro-line"><span>✧ 真实内容已接入，让故事从这里开始。</span><span>无广告 · 非营利 · 按需下载</span></div>`:'';
app.innerHTML=(page==='home'?hero:`<div class="eyebrow">${page==='ranking'?'POPULAR ON WEBTOON':'DISCOVER REAL STORIES'}</div><h1 class="page-title">${page==='ranking'?'韩漫人气选读':'找到下一部好故事'}</h1>`)+`<div class="section-head"><h2>${page==='ranking'?'人气榜单':page==='home'?'热门韩漫精选':search.value.trim()?'搜索结果':'真实作品书库'}<small>REAL MANHWA</small></h2><button data-refresh>刷新内容 ↻</button></div><p class="source-caption">${esc(source)} · ${new Date(updatedAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} 更新<br>精选列表按来源顺序展示，并非本站评分；搜索结果来自 WEBTOON，可能包含其他地区作品。</p><div class="chips">${groups.map(g=>`<button class="chip ${g===activeGenre?'active':''}" data-genre="${esc(g)}" aria-pressed="${g===activeGenre}">${esc(g)}</button>`).join('')}</div>${list.length?`<div class="grid">${list.map(card).join('')}</div>`:`<div class="empty"><h3>没有找到匹配的作品</h3><p>试试繁体作品名或换一个关键词。</p><button class="secondary" data-reset>返回热门列表</button></div>`}<section class="feature-strip"><div class="symbol">✧</div><div><h3>阅读在网页里，喜欢留在书架里。</h3><p>打开作品即可选择章节。完整漫画只在你主动点击「下载」后才会打包。</p></div><a href="#shelf">我的书架 →</a></section>`}
function filteredChapters(){const q=chapterQuery.toLowerCase().replace(/话/g,'話');return currentBook.chapters.filter(ch=>!q||(/^\d+$/.test(q)?ch.no===q:ch.title.toLowerCase().includes(q)))}
function chaptersMarkup(){let chapters=filteredChapters();if(reverse)chapters.reverse();return chapters.slice(0,chapterLimit).map(ch=>`<div class="chapter-row"><a href="${esc(readLink(currentBook,ch))}"><b>${esc(ch.title)}</b><small>${ch.date?new Date(ch.date).toLocaleDateString('zh-CN'):''}${history[currentBook.id]?.url===ch.url?' · 上次阅读':''}</small></a><a class="chapter-download" href="/api/download?url=${encodeURIComponent(ch.url)}" data-download>↓ 下载</a></div>`).join('')||'<p class="subtitle">没有找到匹配的章节</p>'}
function updateChapters(){const count=filteredChapters().length;document.querySelector('#chapter-list').innerHTML=chaptersMarkup();document.querySelector('#chapter-count').textContent='显示 '+Math.min(chapterLimit,count)+' / '+count+' 话';document.querySelector('[data-more]').hidden=chapterLimit>=count}
function showBook(b){currentBook=b;const saved=shelf.some(x=>x.id===b.id),last=history[b.id],ch=b.chapters.find(x=>x.url===last?.url)||b.chapters[0];app.innerHTML=`<a class="back-link" href="#library">‹ 返回书库</a><section class="real-detail"><div class="detail-top"><img src="${esc(imageUrl(b.cover))}" alt="${esc(b.title)}封面"><div><span class="eyebrow">${esc(genreMap(b.genre))} / ${esc(platformName(b))}</span><h1>${esc(b.title)}</h1><p>${esc(b.author)}<br>${esc(b.description)}</p><div class="detail-actions">${ch?`<a class="primary" href="${esc(readLink(b,ch))}">${last?'继续阅读':'开始阅读'} ↗</a>`:''}<button class="secondary" data-save>${saved?'✓ 已在书架':'＋ 加入书架'}</button><a class="plain" href="${esc(originalUrl(b.externalUrl))}" target="_blank" rel="noopener noreferrer">原站作品页 ↗</a></div></div></div>${editionLinks(b)}<div class="chapter-head"><h3>网页章节目录 · ${b.chapters.length} 话</h3><button data-reverse>${reverse?'切换正序 ↑':'切换倒序 ↓'}</button></div><p class="demo-note">目录显示原站开放的网页章节。最新话、付费抢先看和 App 解锁章节以各版本的原站为准。</p><div class="chapter-tools"><input id="chapter-filter" type="search" aria-label="搜索章节" placeholder="输入话数或章节名称" value="${esc(chapterQuery)}"><span id="chapter-count">显示 ${Math.min(chapterLimit,filteredChapters().length)} / ${filteredChapters().length} 话</span></div><div class="chapter-list" id="chapter-list">${chaptersMarkup()}</div><button class="secondary more-chapters" data-more ${filteredChapters().length<=chapterLimit?'hidden':''}>显示更多章节</button></section>`}
function showShelf(mode='saved'){const list=mode==='history'?Object.values(history).sort((a,b)=>b.time-a.time):shelf;app.innerHTML=`<div class="eyebrow">YOUR LITTLE COLLECTION</div><h1 class="page-title">我的故事小岛</h1><p class="subtitle">这里保存作品和阅读位置，不会自动下载章节文件。</p><div class="shelf-tabs"><a href="#shelf?mode=saved" class="${mode==='saved'?'active':''}">我的收藏 · ${shelf.length}</a><a href="#shelf?mode=history" class="${mode==='history'?'active':''}">阅读足迹 · ${Object.keys(history).length}</a></div>${list.length?`<div class="grid">${list.map(card).join('')}</div>`:`<div class="empty"><h3>把下一份心动放在这里</h3><a class="primary" href="#library">去发现真实漫画 ↗</a></div>`}`}
function showReader(b,ch,data){readerData={book:b,chapter:ch,...data};document.body.classList.add('reading');const idx=b.chapters.findIndex(x=>x.url===ch.url),previous=history[b.id],resumePage=previous?.url===ch.url?Math.min(previous.page||0,data.pages.length-1):0;history[b.id]={id:b.id,title:ch.title,bookTitle:b.title,url:ch.url,bookUrl:b.url,cover:b.cover,genre:b.genre,provider:b.provider,page:resumePage,time:Date.now()};save();document.body.classList.toggle('light',getStore('manyu-reader-theme','dark')==='light');app.innerHTML=`<div class="reader-toolbar"><a href="${esc(bookLink(b))}">‹ 章节目录</a><strong>${esc(b.title)}</strong><div><select id="chapter-select" aria-label="切换章节">${b.chapters.map((x,i)=>`<option value="${i}" ${i===idx?'selected':''}>${esc(x.title)}</option>`).join('')}</select><button data-theme>◐ 背景</button></div></div><div class="reader-intro"><span class="eyebrow">${esc(b.title)} / ${esc(platformName(b))}</span><h1>${esc(ch.title)}</h1><p>共 ${data.pages.length} 张图片 · 向下滚动阅读</p></div><article class="comic">${data.pages.map((url,i)=>`<img src="${esc(imageUrl(url))}" alt="第 ${i+1} 张漫画图片" loading="${i<2?'eager':'lazy'}" decoding="async" data-page="${i}" ${data.dimensions?.[i]?.width&&data.dimensions?.[i]?.height?`width="${data.dimensions[i].width}" height="${data.dimensions[i].height}"`:""}>`).join('')}</article><div class="reader-end"><h3>这一话，读完了。</h3><p>点击下载会保存完整章节，普通阅读不会自动保存整章文件。</p><div class="buttons">${idx>0?`<a class="secondary" href="${esc(readLink(b,b.chapters[idx-1]))}">← 上一话</a>`:''}${idx<b.chapters.length-1?`<a class="primary" href="${esc(readLink(b,b.chapters[idx+1]))}">下一话 →</a>`:''}<a class="secondary" href="/api/download?url=${encodeURIComponent(ch.url)}" data-download>↓ 下载本话 CBZ</a></div></div><span class="reader-progress" id="reader-progress">第 ${resumePage+1} / ${data.pages.length} 张</span><button class="reader-reload" data-retry>↻ 重新加载图片</button>`;requestAnimationFrame(()=>{if(resumePage>0){const target=document.querySelector(`[data-page="${resumePage}"]`);target?.scrollIntoView({block:"start"});if(target&&!target.complete)target.addEventListener("load",()=>{if(readerData?.chapter.url===ch.url)target.scrollIntoView({block:"start"})},{once:true})}})}
async function render(){saveReaderPosition();routeController?.abort();routeController=new AbortController();const ticket=++version,[raw,qs='']=location.hash.slice(1).split('?'),page=raw||'home',params=new URLSearchParams(qs);document.body.classList.remove('reading');readerData=null;window.scrollTo(0,0);document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===page));app.innerHTML='<div class="empty loading"><h3>正在打开故事的下一页…</h3><p>正在连接真实内容源</p></div>';let requestedBook;try{if(publicEdition&&(page==='book'||page==='read')){showPublicLink(originalUrl(params.get(page==='read'?'chapter':'url')));return}if(page==='shelf'){showShelf(params.get('mode')||'saved');return}if(page==='book'){chapterLimit=60;chapterQuery='';reverse=false;const b=await api('book',{url:params.get('url')});if(ticket===version)showBook(b);return}if(page==='read'){const b=requestedBook=await api('book',{url:params.get('book')}),ch=b.chapters.find(x=>x.url===params.get('chapter'));if(!ch)throw Error('章节不存在，请返回作品目录重新选择');const d=await api('chapter',{url:ch.url});if(ticket===version)showReader(b,ch,d);return}if(!['home','library','ranking'].includes(page)){location.hash='home';return}search.value=params.get('q')||'';if(page==='ranking'){const d=await api('rankings');if(ticket===version)showRankings(d,params.get('board'));return}if(page==='library'){const d=await api('directory',params);if(ticket===version)showDirectory(d,params);return}const d=await api('catalog',{mode:'popular',q:params.get('q')||''});if(ticket===version){catalogData=d;activeGenre='全部';if(publicEdition)showPublicHome(d.books);else showCatalog()}}catch(e){if(ticket===version)app.innerHTML=errorView(e,originalUrl(params.get(page==='read'?'chapter':'url')),requestedBook)}}
document.querySelector('#search-form').addEventListener('submit',e=>{e.preventDefault();location.hash=routeLink('library',{q:search.value.trim()})});
document.addEventListener('click',e=>{const el=e.target.closest('button,a');if(!el)return;if(el.hasAttribute('data-retry')||el.hasAttribute('data-refresh'))render();if(el.hasAttribute('data-reset'))location.hash='library';if(el.dataset.genre){activeGenre=el.dataset.genre;showCatalog()}if(el.hasAttribute('data-reverse')){reverse=!reverse;el.textContent=reverse?'切换正序 ↑':'切换倒序 ↓';updateChapters()}if(el.hasAttribute('data-more')){chapterLimit+=100;updateChapters()}if(el.hasAttribute('data-save')){const b=currentBook;if(shelf.some(x=>x.id===b.id)){shelf=shelf.filter(x=>x.id!==b.id);toast('已从书架移除')}else{shelf.push({id:b.id,title:b.title,url:b.url,cover:b.cover,genre:b.genre,provider:b.provider});toast('已加入书架')}save();el.textContent=shelf.some(x=>x.id===b.id)?'✓ 已在书架':'＋ 加入书架'}if(el.hasAttribute('data-theme')){document.body.classList.toggle('light');try{localStorage.setItem('manyu-reader-theme',JSON.stringify(document.body.classList.contains('light')?'light':'dark'))}catch{}}if(el.dataset.removeId){const id=el.dataset.removeId,mode=new URLSearchParams(location.hash.split('?')[1]||'').get('mode')||'saved';if(mode==='history')delete history[id];else shelf=shelf.filter(x=>x.id!==id);save();showShelf(mode);toast('已移除记录，漫画文件不受影响')}if(el.hasAttribute('data-download')){e.preventDefault();startDownload(el.href)}if(el.hasAttribute('data-cancel-download')){if(downloadController)downloadController.abort();else downloadDialog.close()}});
document.addEventListener('submit',e=>{if(e.target.id!=='directory-filters')return;e.preventDefault();const params=new URLSearchParams(new FormData(e.target));if(search.value.trim())params.set('q',search.value.trim());const next=routeLink('library',params);if(location.hash===next)render();else location.hash=next});
document.addEventListener('change',e=>{if(e.target.id==='chapter-select'&&readerData)location.hash=readLink(readerData.book,readerData.book.chapters[+e.target.value])});


// A chapter download is explicitly requested and stays in memory until validated.
let downloadController=null;
const downloadDialog=document.createElement('dialog');downloadDialog.className='download-dialog';downloadDialog.setAttribute('aria-labelledby','download-title');
downloadDialog.innerHTML='<h2 id="download-title">下载当前章节</h2><p id="download-status" role="status">正在连接内容源…</p><p class="subtitle">准备完成后保存为 CBZ 漫画文件。你可以随时取消。</p><button class="secondary" data-cancel-download>取消下载</button>';
document.body.append(downloadDialog);
downloadDialog.addEventListener('cancel',e=>{if(downloadController){e.preventDefault();downloadController.abort()}});
async function startDownload(url){
  if(downloadController){toast('已有一个下载正在准备');return}
  const controller=new AbortController();downloadController=controller;
  const status=downloadDialog.querySelector('#download-status'),button=downloadDialog.querySelector('button');
  status.textContent='正在获取正文并打包，请保持连接…';button.textContent='取消下载';downloadDialog.showModal();
  try{
    const response=await fetch(url,{signal:controller.signal});
    if(!response.ok||!response.headers.get('content-type')?.includes('comicbook+zip')){
      let message='章节暂时无法下载，请稍后重试';try{message=(await response.json()).error||message}catch{}throw Error(message);
    }
    if(!response.body)throw Error('下载内容为空');
    const reader=response.body.getReader(),chunks=[];let bytes=0;
    for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);bytes+=value.length;status.textContent='正在打包，已接收 '+(bytes/1048576).toFixed(1)+' MB';if(bytes>160*1048576){controller.abort();throw Error('章节过大，请在原站查看或选择较短的章节')}}
    controller.signal.throwIfAborted();
    const blob=new Blob(chunks,{type:'application/vnd.comicbook+zip'}),tail=await blob.slice(-22).arrayBuffer();
    if(tail.byteLength!==22||new DataView(tail).getUint32(0,true)!==0x06054b50)throw Error('文件传输不完整，没有保存损坏文件，请重试');
    let filename='漫画章节.cbz';const encoded=response.headers.get('content-disposition')?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];if(encoded){try{filename=decodeURIComponent(encoded)}catch{}}
    const objectUrl=URL.createObjectURL(blob),link=document.createElement('a');link.href=objectUrl;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),30000);
    status.textContent='章节文件已准备完成（'+(bytes/1048576).toFixed(1)+' MB），已交给浏览器保存。';
  }catch(error){status.textContent=error.name==='AbortError'?'已取消下载，没有保存文件。':error.name==='TypeError'?'下载连接中断，没有保存文件，请重试。':error.message}
  finally{downloadController=null;button.textContent='关闭'}
}
function saveReaderPosition(){
  if(!readerData)return;
  const images=[...document.querySelectorAll('.comic img')];
  const visible=images.find(img=>img.getBoundingClientRect().bottom>90&&img.getBoundingClientRect().top<innerHeight);
  if(!visible)return;const record=history[readerData.book.id];if(!record)return;
  record.page=Number(visible.dataset.page);record.time=Date.now();
  const indicator=document.querySelector('#reader-progress');if(indicator)indicator.textContent='第 '+(record.page+1)+' / '+readerData.pages.length+' 张';
  clearTimeout(progressTimer);progressTimer=setTimeout(save,250);
}
let scrollFrame=false;
window.addEventListener('scroll',()=>{if(!scrollFrame&&readerData){scrollFrame=true;requestAnimationFrame(()=>{scrollFrame=false;saveReaderPosition()})}},{passive:true});
window.addEventListener('pagehide',()=>{saveReaderPosition();save()});
document.addEventListener('input',e=>{if(e.target.id==='chapter-filter'){chapterQuery=e.target.value.trim();chapterLimit=60;updateChapters()}});
document.addEventListener('error',e=>{if(e.target.matches?.('.comic img')){e.target.classList.add('image-error');e.target.alt='图片加载失败，点击这张图片重试'}},true);
document.addEventListener('click',e=>{if(e.target.matches('.comic img.image-error')){const img=e.target;img.classList.remove('image-error');const url=new URL(img.src);url.searchParams.set('retry',Date.now());img.src=url.href}});
window.addEventListener('hashchange',render);render();
