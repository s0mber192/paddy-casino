import {useCallback, useEffect, useRef, useState} from 'react';
import {api, ApiError, hasInitData, type CardDto, type CaseDto, type GiftDto, type MeResponse} from './api';
import LottiePlayer from './LottiePlayer';

type Tab = 'tap' | 'games' | 'collection' | 'profile';
const format = (value: number) => value.toLocaleString('ru-RU');
const errors: Record<string,string> = {INSUFFICIENT_FUNDS: 'Не хватает игровых звёзд. Натапай ещё!', WHEEL_COOLDOWN: 'Колесо доступно раз в 24 часа.', BAD_AMOUNT: 'Проверь сумму: нужно положительное целое число.', BAD_REQUEST: 'Проверь введённые данные.', CARD_NOT_FOUND: 'Карточка уже продана. Коллекция обновлена.', UNAUTHORIZED: 'Сессия истекла. Открой приложение заново.'};
export default function App() {
  const [tab, setTab] = useState<Tab>('tap');
  const [me, setMe] = useState<MeResponse | null>(null);
  const [gifts, setGifts] = useState<GiftDto[]>([]);
  const [fatal, setFatal] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [bet, setBet] = useState(100);
  const [giftId, setGiftId] = useState('');
  const [sourceCard, setSourceCard] = useState<CardDto | null>(null);
  const [game, setGame] = useState<'upgrade' | 'mystery' | 'cases' | 'wheel'>('upgrade');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(20);
  const [upgradeRotation, setUpgradeRotation] = useState(0);
  const [animatedChance, setAnimatedChance] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState('');
  const [previewCase, setPreviewCase] = useState<CaseDto | null>(null);
  const [strip, setStrip] = useState<number[]>([]);
  const [offset, setOffset] = useState(0);
  const [rolling, setRolling] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const [caseDone, setCaseDone] = useState(false);
  const [caseReward, setCaseReward] = useState(0);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {const snapshot = await api.me(); if (mounted.current) setMe(snapshot);}, []);
  const catalog = useCallback(async () => {
    const list = await api.getGiftList();
    if (!mounted.current) return;
    setGifts(list);
    setGiftId(id => id || [...list].sort((a,b) => a.price_stars-b.price_stars)[0]?.id || '');
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (!hasInitData()) {setFatal('Открой PADDY GAME внутри Telegram.'); return;}
    Promise.all([refresh(), catalog()]).catch(() => setFatal('Не удалось загрузить игру. Попробуй открыть её заново.'));
    const timer = setInterval(() => {void catalog().catch(() => setNotice('Не удалось обновить каталог. Показаны последние цены.'));}, 60_000);
    return () => {mounted.current = false; clearInterval(timer);};
  }, [refresh, catalog]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const showError = (error: unknown) => setNotice(error instanceof ApiError ? errors[error.code] ?? 'Не удалось выполнить действие. Попробуй ещё раз.' : 'Нет связи с сервером. Проверь соединение.');
  const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  // All balance-changing actions share one lock. Final balances are always read
  // from the server, never restored from a delayed animation response.
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setNotice('');
    try {await action();}
    catch (error) {if (mounted.current) showError(error);}
    finally {
      try {await refresh();} catch {if (mounted.current) setNotice('Не удалось сверить баланс. Обнови приложение перед следующим действием.');}
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const tap = () => void run(async () => {await api.click(); window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');});
  const selected = gifts.find(g => g.id === giftId);
  const sourceGift = sourceCard && gifts.find(g => g.id === sourceCard.giftId);
  const stake = sourceGift ? sourceGift.price_stars : bet;
  const chance = selected && stake > 0 ? Math.floor(Math.min(0.95, stake / selected.price_stars) * 1_000_000) / 10_000 : 0;
  const shownChance = animatedChance ?? chance;
  const chanceLabel = shownChance > 0 && shownChance < 0.01
    ? '<0,01%'
    : `${shownChance.toLocaleString('ru-RU', {maximumFractionDigits: 2})}%`;
  const upgrade = () => void run(async () => {
    if (!selected) return;
    setResult('');
    setAnimatedChance(null);
    const response = sourceCard ? await api.upgradeCard(sourceCard.id, selected.id) : await api.standardUpgrade(bet, selected.id);
    const sector = response.chancePercent * 3.6;
    const target = response.win ? sector / 2 : (sector + 360) / 2;
    setAnimatedChance(response.chancePercent);
    setUpgradeRotation(previous => previous + 360 * 4 + ((target - previous % 360 + 360) % 360));
    await pause(3500);
    setSourceCard(null);
    setResult(response.win ? `Карточка ${selected.name} теперь в коллекции!` : 'В этот раз не получилось. Карточка не выпала; звёзды или исходная карточка потрачены.');
  });
  const spin = () => void run(async () => {
    setResult('');
    const response = await api.spinWheel();
    const index = [50,100,200,500,1000,5000].indexOf(response.reward);
    const target = ((270 - index * 60) % 360 + 360) % 360;
    setRotation(previous => previous + 360 * 5 + ((target - previous % 360 + 360) % 360));
    await pause(3500);
    setResult(`+${format(response.reward)} игровых звёзд`);
  });
  const openCase = (item: CaseDto) => void run(async () => {
    setPreviewCase(item); setCaseDone(false); setOffset(0); setRolling(false); setStrip([]);
    try {
      const response = await api.openCase(item.id);
      const prizes = Array.from({length: 35}, () => item.rewards[Math.floor(Math.random()*item.rewards.length)]);
      prizes[30] = response.reward;
      setStrip(prizes); setCaseReward(response.reward);
      await pause(60);
      const container = stripRef.current;
      const card = container?.querySelector<HTMLElement>('[data-prize="30"]');
      const track = container?.querySelector<HTMLElement>('.collection-strip');
      if (container && card && track) {
        const center = card.offsetLeft + card.offsetWidth / 2;
        setRolling(true); setOffset(container.clientWidth/2 - center);
        await pause(3500);
      }
      setRolling(false); setCaseDone(true);
    } catch (error) {setPreviewCase(null); throw error;}
  });
  const sell = (card: CardDto) => void run(async () => {const response = await api.sellCard(card.id); setNotice(`Карточка обменяна на ${format(response.price)} игровых звёзд.`);});
  if (fatal) return <main className="screen center"><h1>PADDY GAME</h1><p>{fatal}</p></main>;
  if (!me) return <main className="screen center"><div className="loader"/><p>Загружаем коллекцию…</p></main>;
  const wheelRemaining = Math.max(0, Math.ceil((me.wheelReadyAt - now) / 1000));
  const wheelCountdown = [Math.floor(wheelRemaining / 3600), Math.floor(wheelRemaining / 60) % 60, wheelRemaining % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
  const unlocked = new Set(me.progress.unlocked);
  const sorted = [...gifts].filter(g => g.name.toLowerCase().includes(search.toLowerCase())).sort((a,b) => a.price_stars-b.price_stars);
  const fresh = gifts.filter(g => !g.price_stale).length;
  const priceText = (gift: GiftDto) => gift.price_updated_at ? `${gift.price_source.toUpperCase()} · ${new Date(gift.price_updated_at).toLocaleString('ru-RU')} ${gift.price_stale ? '· устарела' : ''}` : 'Справочная цена · живой источник не подключён';
  return <main className="screen collection-app">
    <header className="top"><span className="logo">PADDY<b>GAME</b></span><span className="who">{me.user.firstName}</span></header>
    <div className="virtual-note">КОЛЛЕКЦИОННАЯ ИГРА · НЕ TELEGRAM STARS</div>
    <section className="collection-balance"><span>Твои игровые звёзды</span><strong>✦ {format(me.user.balance)}</strong><small>Зарабатывай в игре. Покупки и вывод недоступны.</small></section>
    {notice && <div className="collection-notice" role="status">{notice}<button aria-label="Закрыть уведомление" onClick={() => setNotice('')}>×</button></div>}
    {tab === 'tap' && <section className="collection-tap-page"><h1>Кликер</h1><button className="tap" disabled={busy} onClick={tap} aria-label="Заработать игровые звёзды"><span className="coin">🐸</span></button><p>+{me.config.coinsPerClick} ✦ за тап · всего {format(me.user.totalClicks)}</p><button className="btn" onClick={() => {setTab('games');setGame('upgrade');}}>Перейти к апгрейду →</button><button className="collection-link" onClick={() => {setTab('games');setGame('wheel');setResult('');}}>🎁 Ежедневное колесо{wheelRemaining ? ` · ${wheelCountdown}` : ' · бонус доступен'}</button><div className="collection-tip">Карточки — виртуальные изображения. Их нельзя вывести или получить как настоящие подарки.</div></section>}
    {tab === 'games' && <section><div className="collection-heading"><h1>Игровая комната</h1><span>Только игровые ✦</span></div><div className="collection-tabs">{([['upgrade','Апгрейд'],['mystery','Мистери'],['cases','Кейсы'],['wheel','Колесо']] as const).map(([key,title]) => <button key={key} className={game===key?'selected':''} disabled={busy} onClick={() => {setGame(key);setResult('');setAnimatedChance(null);}}>{title}</button>)}</div>
      {game==='upgrade' && <div className="collection-panel"><h2>Апгрейд</h2>
        <div className="upgrade-meter" role="img" aria-label={`Шанс ${animatedChance ?? chance}%`}>
          <div className="upgrade-meter-ring" style={{background: `conic-gradient(var(--win) 0 ${animatedChance ?? chance}%, #344353 0)`}} />
          <div className="upgrade-meter-center">
            {selected && <div className="upgrade-meter-art"><LottiePlayer url={selected.animation_url}/></div>}
            <strong>{chanceLabel}</strong>
            <small>Шанс успеха</small>
          </div>
          <div className="upgrade-needle" style={{transform: `rotate(${upgradeRotation}deg)`}}><span /></div>
        </div><strong>{selected?.name ?? 'Выбери карточку'}</strong><label>Карточка<select value={giftId} disabled={busy} onChange={e=>{setGiftId(e.target.value);setAnimatedChance(null);}}>{[...gifts].sort((a,b)=>a.price_stars-b.price_stars).map(g=><option key={g.id} value={g.id}>{g.name} · {format(g.price_stars)} ✦</option>)}</select></label>{selected && <small>{priceText(selected)}</small>}<label>{sourceGift ? `Исходная карточка: ${sourceGift.name} · ${format(stake)} ✦` : 'Игровые звёзды на попытку'}{sourceCard && <button className="collection-link" disabled={busy} onClick={()=>setSourceCard(null)}>Использовать звёзды вместо карточки</button>}<input className="input" type="number" min="1" max="100000000" step="1" disabled={busy || !!sourceCard} value={stake} onChange={e=>{setBet(Number(e.target.value));setAnimatedChance(null);}}/></label><button className="btn" disabled={busy || !selected || !Number.isSafeInteger(stake) || stake<1 || stake>=selected.price_stars || (!sourceCard && bet>me.user.balance)} onClick={upgrade}>{busy?'Открываем…':'Попробовать апгрейд'}</button><small>При успехе карточка попадёт в коллекцию. Звёзды или исходная карточка тратятся в любом случае.</small></div>}
      {game==='mystery' && <div className="collection-panel"><span className="collection-large">✧</span><h2>Мистери</h2><p>От 0,1 до 10 твоих игровых звёзд за попытку.</p><label>Игровые звёзды<input className="input" type="number" min="1" max="100000000" disabled={busy} value={bet} onChange={e=>setBet(Number(e.target.value))}/></label><button className="btn" disabled={busy || !Number.isSafeInteger(bet) || bet<1 || bet>me.user.balance} onClick={()=>void run(async()=>{const r=await api.mysteryUpgrade(bet);setResult(`Результат: ${format(r.winAmount)} ✦ · изменение ${r.profit>=0?'+':''}${format(r.profit)} ✦`);})}>Открыть результат</button></div>}
      {game==='cases' && <div className="collection-case-grid">{me.cases.map(item=><article key={item.id}><img src={item.image_url} alt={item.name}/><h2>{item.name}</h2><p>{format(item.price_coins)} игровых ✦</p><button className="btn" disabled={busy || me.user.balance<item.price_coins} onClick={()=>openCase(item)}>Открыть</button></article>)}</div>}
      {game==='wheel' && <div className="collection-panel"><h2>Ежедневное колесо</h2><p>Одна попытка раз в 24 часа.</p><div className="collection-wheel-wrap"><span className="collection-wheel-pointer">▼</span><div className="wheel" style={{transform:`rotate(${rotation}deg)`,transition:'transform 3.5s cubic-bezier(.12,.8,.2,1)'}}>{[50,100,200,500,1000,5000].map((reward,i)=><span key={reward} className="wheel-sector" style={{transform:`rotate(${i*60}deg)`}}>{reward}</span>)}</div></div><button className="btn" disabled={busy || wheelRemaining > 0} onClick={spin}>
        {busy ? 'Крутится…' : wheelRemaining ? `Следующий бонус через ${wheelCountdown}` : 'Крутить бесплатно'}
      </button></div>}
      {result && <div className="collection-result" role="status">{result}</div>}
    </section>}
    {tab==='collection' && <section><div className="collection-heading"><h1>Моя коллекция</h1><span>{me.collection.length} карточек</span></div>{me.collection.length===0?<div className="collection-panel"><span className="collection-large">◇</span><h2>Первая карточка впереди</h2><p>Натапай звёзды и попробуй апгрейд.</p><button className="btn" onClick={()=>{setTab('games');setGame('upgrade');}}>К апгрейду</button></div>:<div className="collection-grid">{me.collection.map(card=>{const gift=gifts.find(g=>g.id===card.giftId);return <article key={card.id}><div className="collection-card-art">{gift && <LottiePlayer url={gift.animation_url}/>}</div><h3>{gift?.name??'Карточка'}</h3><p>{format(gift?.price_stars??0)} игровых ✦</p><small>{gift && priceText(gift)}</small><button className="collection-link" disabled={busy || !gift} onClick={()=>{setSourceCard(card);setTab('games');setGame('upgrade');setResult('');}}>Улучшить карточку →</button><button className="btn" disabled={busy || !gift} onClick={()=>sell(card)}>Продать за игровые ✦</button></article>;})}</div>}
      <div className="collection-heading"><h2>Каталог подарков</h2><span>{fresh}/{gifts.length} актуальных цен</span></div><p className="collection-muted">Изображения подарков используются как виртуальные карточки. Рыночная цена служит ориентиром игровой стоимости. Никаких реальных активов.</p><input className="input" aria-label="Найти карточку" placeholder="Найти карточку…" value={search} onChange={e=>{setSearch(e.target.value);setLimit(20);}}/><div className="collection-grid">{sorted.slice(0,limit).map(g=><article key={g.id}><div className="collection-card-art"><LottiePlayer url={g.animation_url}/></div><h3>{g.name}</h3><p>{format(g.price_stars)} ✦</p><small>{priceText(g)}</small><button className="collection-link" onClick={()=>{setGiftId(g.id);setGame('upgrade');setTab('games');}}>Выбрать для апгрейда →</button></article>)}</div>{limit<sorted.length && <button className="btn" onClick={()=>setLimit(v=>v+20)}>Показать ещё</button>}</section>}
    {tab==='profile' && <section className="profile-sets">
      <div className="collection-panel">
        <h1>{me.user.firstName}</h1>
        <p>{format(me.user.totalClicks)} тапов · открыто {unlocked.size} из {gifts.length} карточек</p>
      </div>
      <h2>Коллекции</h2>
      <p className="collection-muted">Собери все карточки набора, чтобы получить бонус. Открытые карточки засчитываются навсегда.</p>
      {me.progress.sets.map(set => <section className="profile-set" key={set.id}>
        <header>
          <h3>Набор {set.id}</h3>
          <span>{set.giftIds.filter(id => unlocked.has(id)).length}/{set.giftIds.length}</span>
        </header>
        <p>{set.complete ? '✓ Бонус получен' : 'Бонус за набор'} · {format(set.bonus)} ✦</p>
        <div className="profile-set-grid">
          {set.giftIds.map(id => {
            const gift = gifts.find(item => item.id === id);
            const open = unlocked.has(id);
            return <article key={id} className={open ? 'profile-card' : 'profile-card locked'}>
              <div className="profile-card-art">
                {gift && <LottiePlayer url={gift.animation_url}/>}
                {!open && <span className="profile-card-lock" aria-label="Закрыта">🔒</span>}
              </div>
              <strong>{gift?.name ?? 'Карточка'}</strong>
            </article>;
          })}
        </div>
      </section>)}
    </section>}
    <nav className="bottom-nav">{([['tap','✦','Тапать'],['games','◈','Игры'],['collection','▦','Коллекция'],['profile','●','Профиль']] as const).map(([key,icon,title])=><button key={key} className={tab===key?'active':''} onClick={()=>setTab(key)}><span>{icon}</span><small>{title}</small></button>)}</nav>
    {previewCase && <div className="modal"><div className="modal-card"><h2>{previewCase.name}</h2><div className="collection-roulette" ref={stripRef}><div className="collection-roulette-pointer"/><div className="collection-strip" style={{transform:`translateX(${offset}px)`,transition:rolling?'transform 3.5s cubic-bezier(.1,.9,.2,1)':'none'}}>{strip.map((reward,index)=><div data-prize={index} key={index}>✦<strong>{format(reward)}</strong></div>)}</div></div>{caseDone?<><h3>+{format(caseReward)} игровых ✦</h3><button className="btn" disabled={busy} onClick={()=>setPreviewCase(null)}>Готово</button></>:<p>Открываем…</p>}</div></div>}
  </main>;
}
