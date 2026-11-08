import {useCallback, useEffect, useRef, useState} from 'react';
import {api, ApiError, hasInitData, type CardDto, type CaseDto, type GiftDto, type MeResponse, type Rocket} from './api';
import LottiePlayer from './LottiePlayer';

const gameModes = [
  {id: 'upgrade', title: 'Апгрейд', description: 'Выбери цель и проверь шанс', icon: '🎯', art: ['150','59','40','64','164','143']},
  {id: 'mystery', title: 'Мистери', description: 'Раскрой награду', icon: '🔮', art: ['45','61','71']},
  {id: 'cases', title: 'Кейсы', description: 'Выбери свой кейс', icon: '🎁', art: ['143','79','62']},
  {id: 'wheel', title: 'Бонусное колесо', description: 'Бесплатное вращение каждый день', icon: '🎡', art: ['64','56','150']},
  {id: 'rocket', title: 'Ракета', description: 'Запусти полёт с карточкой', art: ['143','145','40']},
  {id: 'collection', title: 'Коллекции', description: 'Карточки, наборы и каталог', icon: '🗂️', art: ['62','44','145']},
] as const;
type Game = typeof gameModes[number]['id'];
type Tab = 'tap' | 'games' | 'profile';
function ModeIllustration({mode}: {mode: Game}) {
  return <svg className="mode-illustration" viewBox="0 0 120 120" fill="none" aria-hidden="true">
    {mode === 'collection' && <g transform="rotate(-12 60 60)">
      <rect x="27" y="24" width="70" height="77" rx="10" fill="#2a1728" stroke="#ffbb73" strokeWidth="3"/>
      <path d="M39 24v77M47 33h42" stroke="#ffbb73" strokeWidth="3"/>
      <rect x="49" y="43" width="34" height="40" rx="5" fill="#a4524a" stroke="#ffdba7"/>
      <path d="m66 49 11 14-11 13-11-13z" fill="#ffcf8f"/>
    </g>}
    {(mode === 'upgrade' || mode === 'wheel') && <>
      <circle cx="60" cy="60" r="42" fill="#142520" stroke="#e9c783" strokeWidth="4"/>
      <circle cx="60" cy="60" r="34" stroke="#fff5cf" strokeWidth="7" strokeDasharray={mode==='upgrade'?'58 156':'15 11'}/>
      <circle cx="60" cy="60" r="22" stroke="#e9c783" opacity=".45"/>
      <path d="m54 14 6 13 6-13z" fill="#fff1bf"/>
      <path d={mode==='upgrade'?'m49 66 11-17 11 17M60 50v24':'m60 44 5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z'} stroke="#ffdf9e" strokeWidth="3" strokeLinejoin="round"/>
    </>}
    {mode === 'mystery' && <>
      <circle cx="60" cy="53" r="32" fill="#30204a" stroke="#e6b5ff" strokeWidth="3"/>
      <path d="M42 86h36l8 11H34z" fill="#9368b4" stroke="#e6b5ff"/>
      <path d="m60 34 5 14 14 5-14 5-5 14-5-14-14-5 14-5z" fill="#e6b5ff"/>
    </>}
    {mode === 'rocket' && <g transform="rotate(28 60 60)">
      <path d="M60 13C45 25 41 50 46 79h28c5-29 1-54-14-66Z" fill="#c2ecff" stroke="#fff" strokeWidth="3"/>
      <circle cx="60" cy="48" r="9" fill="#264965"/>
      <path d="M47 61 34 84l13-6m26-17 13 23-13-6M53 84l7 24 7-24" fill="#ffc377"/>
    </g>}
    {mode === 'cases' && <>
      <rect x="26" y="48" width="68" height="43" rx="8" fill="#24445c" stroke="#bceaff" strokeWidth="3"/>
      <path d="m26 51 12-24h44l12 24M26 62h68M55 62v13h10V62" stroke="#bceaff" strokeWidth="3" strokeLinejoin="round"/>
    </>}
  </svg>;
}
const format = (value: number) => value.toLocaleString('ru-RU');
const errors: Record<string,string> = {TOO_FAST: 'Достигнут лимит скорости тапов.', NO_OFFLINE_REWARD: 'Медведи ещё копят звёзды.', ROCKET_ACTIVE: 'Полёт уже идёт.', INSUFFICIENT_FUNDS: 'Не хватает игровых звёзд. Натапай ещё!', WHEEL_COOLDOWN: 'Колесо доступно раз в 24 часа.', BAD_AMOUNT: 'Проверь сумму: нужно положительное целое число.', BAD_REQUEST: 'Проверь введённые данные.', CARD_NOT_FOUND: 'Карточка уже продана. Коллекция обновлена.', UNAUTHORIZED: 'Сессия истекла. Открой приложение заново.'};
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
  const [game, setGame] = useState<Game | null>(null);
  const [albumPage, setAlbumPage] = useState(0);
  const [rocketCard, setRocketCard] = useState('');
  const [rocket, setRocket] = useState<Rocket|null>(null);
  const [flightFactor, setFlightFactor] = useState(1);
  const tapQueue = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapping = useRef(false);
  const [collectionView, setCollectionView] = useState<'album' | 'catalog'>('album');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(20);
  const [upgradeOutcome, setUpgradeOutcome] = useState<boolean | null>(null);
  const [mysteryOpening, setMysteryOpening] = useState(false);
  const [mysteryResult, setMysteryResult] = useState<{winAmount: number; profit: number} | null>(null);
  const [upgradeRotation, setUpgradeRotation] = useState(0);
  const [animatedChance, setAnimatedChance] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState('');
  const [previewCase, setPreviewCase] = useState<CaseDto | null>(null);
  const [strip, setStrip] = useState<string[]>([]);
  const [offset, setOffset] = useState(0);
  const [rolling, setRolling] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const [caseDone, setCaseDone] = useState(false);
  const [caseReward, setCaseReward] = useState('');
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
  const scheduleTaps = () => {
    if (tapTimer.current || tapping.current) return;
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      if (!mounted.current) return;
      if (lock.current) {scheduleTaps();return;}
      tapping.current = true;
      void run(async () => {
        try {
          while (tapQueue.current && mounted.current) {
            const count = Math.min(12,tapQueue.current);
            tapQueue.current -= count;
            const response = await api.click(count);
            setMe(current => current && ({...current,user:{...current.user,balance:response.balance,totalClicks:response.totalClicks}}));
            if (response.accepted < count) {setNotice('Достигнут лимит скорости тапов.');break;}
          }
        } finally {tapQueue.current = 0;}
      }).finally(() => {
        tapping.current = false;
        if (tapQueue.current && mounted.current) scheduleTaps();
      });
    },120);
  };
  const tap = () => {
    if (lock.current && !tapping.current) return;
    tapQueue.current += 1;
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
    scheduleTaps();
  };

  useEffect(() => {
    if (game !== 'rocket' || tab !== 'games') return;
    let current = true;
    let pending = false;
    const poll = async () => {
      if (pending) return;
      pending = true;
      try {
        const state = await api.rocket();
        if (current) setRocket(previous => {
          if (previous && (!state || state.launched < previous.launched ||
            (state.launched === previous.launched && previous.status !== 'flying' && state.status === 'flying'))) return previous;
          return state;
        });
      } catch {} finally {pending = false;}
    };
    void poll();
    const timer = setInterval(poll,400);
    return () => {current = false;clearInterval(timer);};
  },[game,tab]);

  useEffect(() => {
    if (!rocket || rocket.status !== 'flying') {setFlightFactor(rocket?.multiplier ?? 1);return;}
    const received = performance.now();
    const timer = setInterval(() => {
      const elapsed = rocket.now - rocket.launched + performance.now() - received;
      setFlightFactor(Math.min(20,Math.exp(elapsed / 4500)));
    },40);
    return () => clearInterval(timer);
  },[rocket]);
  const selected = gifts.find(g => g.id === giftId);
  const sourceGift = sourceCard && gifts.find(g => g.id === sourceCard.giftId);
  const stake = sourceGift ? sourceGift.price_stars : bet;
  const chance = selected && stake > 0 ? Math.floor(Math.min(0.95, stake / selected.price_stars) * 1_000_000) / 10_000 : 0;
  const shownChance = animatedChance ?? chance;
  const chanceLabel = shownChance > 0 && shownChance < 0.01
    ? '<0,01%'
    : `${shownChance.toLocaleString('ru-RU', {maximumFractionDigits: 2})}%`;
  const resetUpgrade = () => {
    setUpgradeOutcome(null);
    setAnimatedChance(null);
  };
  const openGame = (mode: Game | null) => {
    setGame(mode);
    setResult('');
    resetUpgrade();
    setMysteryResult(null);
  };
  const upgrade = () => void run(async () => {
    if (!selected) return;
    setResult('');
    resetUpgrade();
    const response = sourceCard ? await api.upgradeCard(sourceCard.id, selected.id) : await api.standardUpgrade(bet, selected.id);
    const sector = response.chancePercent * 3.6;
    // Sample the interior of the sector indicated by the server outcome.
    const start = response.win ? 0 : sector;
    const end = response.win ? sector : 360;
    const target = start + (end - start) * (0.08 + Math.random() * 0.84);
    setAnimatedChance(response.chancePercent);
    setUpgradeRotation(previous => previous + 360 * 4 + ((target - previous % 360 + 360) % 360));
    await pause(3500);
    setSourceCard(null);
    setUpgradeOutcome(response.win);
  });
  const revealMystery = () => void run(async () => {
    setMysteryResult(null);
    setMysteryOpening(true);
    try {
      const [outcome] = await Promise.all([api.mysteryUpgrade(bet), pause(2600)]);
      setMysteryResult(outcome);
    } finally {
      setMysteryOpening(false);
    }
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
      const prizes = Array.from({length: 35}, () => item.giftIds[Math.floor(Math.random()*item.giftIds.length)]);
      prizes[30] = response.giftId;
      setStrip(prizes); setCaseReward(response.giftId);
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
  const albumSets = [...me.progress.sets].reverse();
  const fresh = gifts.filter(g => !g.price_stale).length;
  const priceText = (gift: GiftDto) => gift.price_updated_at ? `${gift.price_source.toUpperCase()} · ${new Date(gift.price_updated_at).toLocaleString('ru-RU')} ${gift.price_stale ? '· устарела' : ''}` : 'Справочная цена · живой источник не подключён';
  return <main className="screen collection-app">
    <header className="top paddy-top">
      <button className="paddy-account" aria-label="Открыть профиль" onClick={() => setTab('profile')}>
        <span className="paddy-avatar">{me.user.firstName.slice(0, 1).toUpperCase()}</span>
        <span className="logo">PADDY<b>GAME</b></span>
      </button>
      <div className="paddy-wallet"><small>Игровые звёзды</small><strong>✦ {format(me.user.balance)}</strong></div>
    </header>
    {notice && <div className="collection-notice" role="status">{notice}<button aria-label="Закрыть уведомление" onClick={() => setNotice('')}>×</button></div>}
    {tab === 'tap' && <section className="collection-tap-page"><h1>Кликер</h1>
      <button className="tap" onClick={tap} aria-label="Заработать игровые звёзды"><span className="paddy-coin" aria-hidden="true">✦<small>PADDY</small></span></button>
      <p>+{me.clicker.perTap} ✦ за тап · всего {format(me.user.totalClicks)}</p>
      <div className="clicker-upgrades">
        <article><h2>Сила тапа</h2><p>Следующий уровень даёт +1 ✦ за тап.</p>
          <button className="btn" disabled={busy || me.clicker.powerPrice === null || me.user.balance < me.clicker.powerPrice} onClick={()=>void run(async()=>{await api.improveClicker('power');})}>{me.clicker.powerPrice === null?'Максимум':`Улучшить · ${format(me.clicker.powerPrice)} ✦`}</button>
        </article>
        <article><h2>Медведи-агенты · {me.clicker.bears}</h2><p>Каждый приносит 30 ✦ за 15 минут. Запас копится до 8 часов.</p>
          <button className="btn" disabled={busy || me.clicker.bearPrice === null || me.user.balance < me.clicker.bearPrice} onClick={()=>void run(async()=>{await api.improveClicker('bear');})}>{me.clicker.bearPrice === null?'Все наняты':`Нанять · ${format(me.clicker.bearPrice)} ✦`}</button>
          {me.clicker.bears > 0 && <button className="collection-link" disabled={busy} onClick={()=>void run(async()=>{const {reward}=await api.improveClicker('collect');setNotice(`Агенты принесли ${format(reward)} ✦`);})}>Забрать накопленное</button>}
        </article>
      </div>
    </section>}
    {tab === 'games' && <section className="paddy-games">
      {game === null ? <>
        <div className="collection-heading"><h1>Игры</h1></div>
        <div className="mode-grid">
          {gameModes.map(mode => <button key={mode.id} className={`mode-tile mode-${mode.id}`} disabled={busy} onClick={() => openGame(mode.id)}>
            <span className="mode-art" aria-hidden="true"><ModeIllustration mode={mode.id}/>{mode.art.map((id,index)=>{
              const gift = gifts.find(item=>item.id===id);
              return gift && <span className="mode-gift" key={id} style={{'--angle':`${index * 360 / mode.art.length}deg`} as React.CSSProperties}><LottiePlayer url={gift.animation_url}/></span>;
            })}</span>
            <span className="mode-copy"><strong>{mode.title}</strong><small>{mode.description}</small></span>
          </button>)}
        </div>
      </> : <button className="mode-back" disabled={busy} onClick={() => openGame(null)}>‹ Все игры</button>}
      {game==='upgrade' && <div className="collection-panel"><h2>Апгрейд</h2>
        <div className="upgrade-meter">
          <div className="upgrade-meter-ring" style={{background: `conic-gradient(var(--win) 0 ${animatedChance ?? chance}%, #344353 0)`}} />
          <div className={`upgrade-meter-center ${upgradeOutcome === null ? "" : upgradeOutcome ? "is-win" : "is-loss"}`} aria-live="polite">
            {selected && <div className="upgrade-meter-art"><LottiePlayer url={selected.animation_url}/></div>}
            <strong className={upgradeOutcome === null ? undefined : 'upgrade-outcome'}>
              {upgradeOutcome === null ? chanceLabel : upgradeOutcome ? 'Повезло!' : 'Не повезло'}
            </strong>
            <small>{upgradeOutcome === null ? 'Шанс успеха' : upgradeOutcome ? 'Карточка получена' : 'Попытка завершена'}</small>
          </div>
          <div className="upgrade-needle" style={{transform: `rotate(${upgradeRotation}deg)`}}><span /></div>
        </div>
        <div className="upgrade-inputs">
          <div className="upgrade-slot">
            <label>{sourceGift ? sourceGift.name : 'Твоя ставка'}
              <input className="input" type="number" min="1" max="100000000" step="1" disabled={busy || !!sourceCard} value={stake} onChange={e => {setBet(Number(e.target.value));resetUpgrade();}}/>
            </label>
            {sourceCard && <button className="collection-link" disabled={busy} onClick={() => {setSourceCard(null);resetUpgrade();}}>Ставить звёзды</button>}
          </div>
          <div className="upgrade-slot">
            <label>Цель
              <select value={giftId} disabled={busy} onChange={e => {setGiftId(e.target.value);resetUpgrade();}}>
                {[...gifts].sort((a,b) => a.price_stars-b.price_stars).map(g => <option key={g.id} value={g.id}>{g.name} · {format(g.price_stars)} ✦</option>)}
              </select>
            </label>
            {selected && <small>{priceText(selected)}</small>}
          </div>
        </div>
        <button className="btn" disabled={busy || !selected || !Number.isSafeInteger(stake) || stake < 1 || stake >= selected.price_stars || (!sourceCard && bet > me.user.balance)} onClick={upgrade}>{busy ? 'Крутим…' : 'Апгрейд'}</button>
      </div>}
      {game === 'mystery' && <div className="collection-panel mystery-panel">
        <h2>Мистери</h2>
        <div className={`mystery-stage ${mysteryOpening ? 'opening' : mysteryResult ? 'revealed' : ''}`}>
          <div className="mystery-orbit" aria-hidden="true" /><div className="mystery-particles" aria-hidden="true">{Array.from({length:8},(_,i)=><i key={i} style={{transform:`rotate(${45*i}deg)`}}/>)}</div>
          <div className="mystery-core" role="status">
            <strong>{mysteryResult ? `${format(mysteryResult.winAmount)} ✦` : '?'}</strong>
            <small>{mysteryOpening ? 'Раскрываем…' : mysteryResult ? `${mysteryResult.profit >= 0 ? '+' : '−'}${format(Math.abs(mysteryResult.profit))} к балансу` : 'Скрытая награда'}</small>
          </div>
        </div>
        <p className="collection-muted">Диапазон награды: {format(Math.ceil(bet / 10))}–{format(bet * 10)} ✦</p>
        <label>Игровые звёзды
          <input className="input" type="number" min="1" max="100000000" disabled={busy} value={bet} onChange={e => {setBet(Number(e.target.value));setMysteryResult(null);}}/>
        </label>
        <button className="btn" disabled={busy || !Number.isSafeInteger(bet) || bet < 1 || bet > me.user.balance} onClick={revealMystery}>{mysteryOpening ? 'Раскрываем…' : 'Раскрыть Мистери'}</button>
      </div>}
      {game==='cases' && <div className="collection-case-grid">{me.cases.map(item=><article key={item.id}>
        <div className={`case-cover case-${item.theme}`} aria-hidden="true">{item.giftIds.map(id => {
          const gift = gifts.find(g=>g.id===id);
          return gift && <div key={id}><LottiePlayer url={gift.animation_url}/></div>;
        })}</div><h2>{item.name}</h2><p>{format(item.price_coins)} игровых ✦</p>
        <button className="btn" disabled={busy || me.user.balance<item.price_coins} onClick={()=>openCase(item)}>Открыть</button>
      </article>)}</div>}
      {game==='rocket' && <div className="collection-panel rocket-panel">
        <h2>Ракета</h2>
        <div className={`rocket-scene ${rocket?.status ?? 'ready'}`}>
          <strong>×{flightFactor.toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong>
          <span style={{transform:`translate(${Math.min(60,(flightFactor-1)*34)}px,${-Math.min(66,(flightFactor-1)*34)}px)`}}><ModeIllustration mode="rocket"/></span>
        </div>
        {rocket?.status === 'flying' ? <>
          <p>Стоимость карточки: {format(rocket.stake)} ✦</p>
          <button className="btn" disabled={busy} onClick={()=>void run(async()=>setRocket(await api.cashRocket(rocket.launched)))}>Забрать звёзды</button>
        </> : <>
          {rocket?.status === 'crashed' && <p>Полёт завершился. Карточка потрачена.</p>}
          {rocket?.status === 'cashed' && <p>Получено {format(rocket.payout ?? 0)} ✦</p>}
          <p>Выбери карточку из альбома. Забери звёзды до конца полёта.</p>
          <select className="input" aria-label="Карточка для полёта" value={rocketCard} onChange={e=>setRocketCard(e.target.value)} disabled={busy}>
            <option value="">Выбрать карточку</option>
            {me.collection.map(card=><option key={card.id} value={card.id}>{gifts.find(g=>g.id===card.giftId)?.name ?? 'Карточка'} · {format(gifts.find(g=>g.id===card.giftId)?.price_stars ?? 0)} ✦</option>)}
          </select>
          <button className="btn" disabled={busy || !me.collection.some(card=>String(card.id)===rocketCard)} onClick={()=>void run(async()=>{setRocket(await api.launchRocket(Number(rocketCard)));setRocketCard('');})}>Запустить ракету</button>
        </>}
      </div>}
      {game==='wheel' && <div className="collection-panel"><h2>Ежедневное колесо</h2><p>Одна попытка раз в 24 часа.</p><div className="collection-wheel-wrap"><span className="collection-wheel-pointer">▼</span><div className="wheel" style={{transform:`rotate(${rotation}deg)`,transition:'transform 3.5s cubic-bezier(.12,.8,.2,1)'}}>{[50,100,200,500,1000,5000].map((reward,i)=><span key={reward} className="wheel-sector" style={{transform:`rotate(${i*60}deg)`}}>{reward}</span>)}</div></div><button className="btn" disabled={busy || wheelRemaining > 0} onClick={spin}>
        {busy ? 'Крутится…' : wheelRemaining ? `Следующий бонус через ${wheelCountdown}` : 'Крутить бесплатно'}
      </button></div>}
      {result && <div className="collection-result" role="status">{result}</div>}
    </section>}
    {tab==='games' && game==='collection' && <div className="album-switch" role="group" aria-label="Раздел коллекций">
      <button aria-pressed={collectionView==='album'} onClick={()=>setCollectionView('album')}>Альбом</button>
      <button aria-pressed={collectionView==='catalog'} onClick={()=>setCollectionView('catalog')}>Каталог</button>
    </div>}
    {tab==='games' && game==='collection' && collectionView==='album' && <section><details className="album-inventory"><summary>Мои карточки · {me.collection.length}</summary><div className="collection-heading"><h1>Моя коллекция</h1><span>{me.collection.length} карточек</span></div>{me.collection.length===0?<div className="collection-panel"><span className="collection-large">◇</span><h2>Первая карточка впереди</h2><p>Натапай звёзды и попробуй апгрейд.</p><button className="btn" onClick={()=>{setTab('games');openGame('upgrade');}}>К апгрейду</button></div>:<div className="collection-grid">{me.collection.map(card=>{const gift=gifts.find(g=>g.id===card.giftId);return <article key={card.id}><div className="collection-card-art">{gift && <LottiePlayer url={gift.animation_url}/>}</div><h3>{gift?.name??'Карточка'}</h3><p>{format(gift?.price_stars??0)} игровых ✦</p><small>{gift && priceText(gift)}</small><button className="collection-link" disabled={busy || !gift} onClick={()=>{setSourceCard(card);setTab('games');openGame('upgrade');setResult('');}}>Улучшить карточку →</button><button className="btn" disabled={busy || !gift} onClick={()=>sell(card)}>Продать за игровые ✦</button></article>;})}</div>}
    </details></section>}
    {tab==='games' && game==='collection' && collectionView==='catalog' && <section>
      <div className="collection-heading"><h2>Каталог подарков</h2><span>{fresh}/{gifts.length} актуальных цен</span></div><p className="collection-muted">Изображения подарков используются как виртуальные карточки. Рыночная цена служит ориентиром игровой стоимости. Никаких реальных активов.</p><input className="input" aria-label="Найти карточку" placeholder="Найти карточку…" value={search} onChange={e=>{setSearch(e.target.value);setLimit(20);}}/><div className="collection-grid">{sorted.slice(0,limit).map(g=><article key={g.id}><div className="collection-card-art"><LottiePlayer url={g.animation_url}/></div><h3>{g.name}</h3><p>{format(g.price_stars)} ✦</p><small>{priceText(g)}</small><button className="collection-link" onClick={()=>{setSourceCard(null);setGiftId(g.id);openGame('upgrade');setTab('games');}}>Выбрать для апгрейда →</button></article>)}</div>{limit<sorted.length && <button className="btn" onClick={()=>setLimit(v=>v+20)}>Показать ещё</button>}</section>}
    {tab==='profile' && <section className="profile-sets">
      <div className="collection-panel"><h1>{me.user.firstName}</h1>
        {me.user.username && <p>@{me.user.username}</p>}
        <p>{format(me.user.totalClicks)} тапов · {unlocked.size} открытых карточек</p>
      </div>
      <div className="collection-panel referral-panel">
        <h2>Пригласи друзей</h2><p>Приглашено: {me.referrals.count}. Учитывается первый вход по твоей ссылке.</p>
        <button className="btn" onClick={async () => {
          const url = `https://t.me/s0mber_Flop_bot?startapp=ref_${me.user.id}`;
          try {await navigator.clipboard.writeText(url);setNotice('Ссылка скопирована.');}
          catch {setNotice(url);}
        }}>Скопировать ссылку</button>
      </div>
      <h2>Квесты</h2>
      <div className="quest-list">
        <div className="quest-row"><div><strong>Ежедневный бонус</strong><small>Бесплатное вращение раз в 24 часа</small></div><button className="btn" disabled={busy} onClick={()=>{setTab('games');openGame('wheel');}}>Открыть</button></div>
        {me.quests.map(quest => <div className="quest-row" key={quest.id}>
          <div><strong>{quest.title}</strong><small>{quest.progress}/{quest.target} · +{format(quest.reward)} ✦</small></div>
          <button className="btn" disabled={busy || quest.claimed || quest.progress < quest.target} onClick={()=>void run(async ()=>{
            const {reward}=await api.claimQuest(quest.id);setNotice(`Получено +${format(reward)} ✦`);
          })}>{quest.claimed?'Получено':'Забрать'}</button>
        </div>)}
        <div className="quest-row"><div><strong>Поставь логотип PADDY на аватарку</strong><small>Откроется после выхода логотипа</small></div><button className="btn" disabled>Скоро</button></div>
        {me.referrals.milestones.map(m => <div className="quest-row" key={m.count}>
          <div><strong>Пригласить {m.count} друзей</strong><small>{Math.min(me.referrals.count,m.count)}/{m.count} · +{format(m.reward)} ✦</small></div>
          <button className="btn" disabled={busy || !m.available} onClick={()=>void run(async ()=>{
            const {reward}=await api.claimReferral(m.count);setNotice(`Получено +${format(reward)} ✦`);
          })}>{m.claimed?'Получено':'Забрать'}</button>
        </div>)}
      </div>
    </section>}
    {tab==='games' && game==='collection' && collectionView==='album' && <section className="profile-sets">
      <h2>Коллекции</h2>
      <p className="collection-muted">Собери все карточки набора, чтобы получить бонус. Открытые карточки засчитываются навсегда.</p>
      <div className="album-pagination">
        <button className="btn" disabled={albumPage===0} onClick={()=>setAlbumPage(page=>page-1)}>←</button>
        <span>Страница {albumPage+1} / {albumSets.length}</span>
        <button className="btn" disabled={albumPage>=albumSets.length-1} onClick={()=>setAlbumPage(page=>page+1)}>→</button>
      </div>
      {albumSets.slice(albumPage,albumPage+1).map(set => <section className="profile-set album-sheet" key={set.id}>
        <header>
          <h3>Набор {albumPage + 1}</h3>
          <span>{set.giftIds.filter(id => unlocked.has(id)).length}/{set.giftIds.length}</span>
        </header>
        <p>{set.complete ? '✓ Бонус получен' : 'Бонус за набор'} · {format(set.bonus)} ✦</p>
        <div className="profile-set-grid">
          {set.giftIds.map(id => {
            const gift = gifts.find(item => item.id === id);
            const open = unlocked.has(id);
            const copies = me.collection.filter(card=>card.giftId===id).length;
            return <article key={id} className={open ? 'profile-card' : 'profile-card locked'}>
              <div className="profile-card-art">
                {gift && <LottiePlayer url={gift.animation_url}/>}
                {copies > 0 && <span className="album-copy">×{copies}</span>}
                {!open && <span className="profile-card-lock" aria-label="Закрыта">🔒</span>}
              </div>
              <strong>{gift?.name ?? 'Карточка'}</strong>
            </article>;
          })}
        </div>
      </section>)}
    </section>}
    <nav className="bottom-nav">{([['tap','✦','Тапать'],['games','◈','Игры'],['profile','●','Профиль']] as const).map(([key,icon,title])=><button key={key} className={tab===key?'active':''} disabled={busy} onClick={()=>{setTab(key);if(key==='games')openGame(null);window.scrollTo(0,0);}}><span>{icon}</span><small>{title}</small></button>)}</nav>
    {previewCase && <div className="modal"><div className="modal-card"><h2>{previewCase.name}</h2><div className="collection-roulette" ref={stripRef}><div className="collection-roulette-pointer"/><div className="collection-strip" style={{transform:`translateX(${offset}px)`,transition:rolling?'transform 3.5s cubic-bezier(.1,.9,.2,1)':'none'}}>{strip.map((reward,index)=><div data-prize={index} key={index}>{gifts.find(g=>g.id===reward) && <LottiePlayer url={gifts.find(g=>g.id===reward)!.animation_url} style={{width:44,height:44}}/>}<strong>{gifts.find(g=>g.id===reward)?.name ?? 'Карточка'}</strong></div>)}</div></div>{caseDone?<><h3>{gifts.find(g=>g.id===caseReward)?.name ?? 'Карточка'} добавлена в коллекцию</h3><button className="btn" disabled={busy} onClick={()=>setPreviewCase(null)}>Готово</button></>:<p>Открываем…</p>}</div></div>}
  </main>;
}
