import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, hasInitData, type CaseDto, type UserDto, type GiftDto } from './api';
import LottiePlayer from './LottiePlayer';

interface Pop { id: number; x: number; y: number; value: number }

const haptic = (s: 'light' | 'medium' | 'heavy' = 'light') =>
  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(s);

const WIN_TEXTS = ['ПОБЕДА', 'В ТОЧКУ', 'ДЖЕКПОТ', 'ФОРТУНА'];
const LOSE_TEXTS = ['ПРОВАЛ', 'МИМО', 'НЕ СУДЬБА', 'В ДРУГОЙ РАЗ'];

export default function App() {
  const [activeTab, setActiveTab] = useState<'main' | 'games' | 'profile' | 'withdraw'>('main');
  const [activeGame, setActiveGame] = useState<'none' | 'standard' | 'mystery' | 'cases' | 'wheel'>('none');

  const [user, setUser] = useState<UserDto | null>(null);
  const [cases, setCases] = useState<CaseDto[]>([]);
  const [coinsPerClick, setCoinsPerClick] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pops, setPops] = useState<Pop[]>([]);
  const [prize, setPrize] = useState<{ reward: number; price: number } | null>(null);
  const popId = useRef(0);

  const [caseRolling, setCaseRolling] = useState(false);
  const [showCaseModal, setShowCaseModal] = useState(false);
  const [openingCase, setOpeningCase] = useState<CaseDto | null>(null);
  const [caseStrip, setCaseStrip] = useState<number[]>([]);
  const [caseOffset, setCaseOffset] = useState(0);
  const [caseResult, setCaseResult] = useState<number | null>(null);
  
  const [isSpinning, setIsSpinning] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);

  const [upgradeBet, setUpgradeBet] = useState(100);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [upgradeWheelRotation, setUpgradeWheelRotation] = useState(0);
  
  const [upgradeResult, setUpgradeResult] = useState<{ text: string, type: 'win' | 'lose' } | null>(null);
  
  const [giftList, setGiftList] = useState<GiftDto[]>([]);
  const [selectedGift, setSelectedGift] = useState<GiftDto | null>(null);
  const [isGiftModalOpen, setIsGiftModalOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [visibleCount, setVisibleCount] = useState(20);
  
  const [mysteryBet, setMysteryBet] = useState(100);
  const [isMystery, setIsMystery] = useState(false);
  
  const [withdrawAmount, setWithdrawAmount] = useState<number | ''>('');

  useEffect(() => {
    if (!hasInitData()) return setError('Откройте внутри Telegram');
    
    const tg = (window as any).Telegram?.WebApp;
    const startParam = tg?.initDataUnsafe?.start_param;
    
    api.me(startParam).then((r) => {
      setUser(r.user); setCases(r.cases); setCoinsPerClick(r.config.coinsPerClick);
    }).catch((e) => setError(e instanceof ApiError && e.status === 401 ? 'Ошибка авторизации' : 'Сервер недоступен'));

    api.getGiftList().then(list => setGiftList(list)).catch(console.error);
  }, []);

  const onTap = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!user) return;
    haptic('light');
    const rect = e.currentTarget.getBoundingClientRect();
    const id = ++popId.current;
    setPops((p) => [...p.slice(-15), { id, x: e.clientX - rect.left, y: e.clientY - rect.top, value: coinsPerClick }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 800);
    api.click().then((r) => setUser((u) => (u && r.totalClicks >= u.totalClicks ? { ...u, balance: r.balance, totalClicks: r.totalClicks } : u))).catch(() => {});
  }, [user, coinsPerClick]);

  const onOpenCase = async (c: CaseDto) => {
    if (caseRolling || !user || user.balance < c.price_coins) return;
    
    setOpeningCase(c);
    setShowCaseModal(true);
    setCaseRolling(true);
    setCaseResult(null);
    haptic('medium');
    
    setUser((u) => (u ? { ...u, balance: u.balance - c.price_coins } : u));

    try {
      const r = await api.openCase(c.id);
      setCaseResult(r.reward);

      const prizes = c.rewards;
      const strip = Array.from({ length: 50 }, () => prizes[Math.floor(Math.random() * prizes.length)]);
      strip[45] = r.reward;
      
      setCaseStrip(strip);
      
      setTimeout(() => {
        setCaseOffset(window.innerWidth / 2 - 40 - 45 * 80);
      }, 50);

      setTimeout(() => {
        setCaseRolling(false);
        api.me().then(res => setUser(res.user)).catch(console.error);
      }, 12000);

    } catch { 
      setCaseRolling(false); 
      setShowCaseModal(false);
      api.me().then(res => setUser(res.user)).catch(console.error);
      alert('Ошибка при открытии кейса');
    }
  };

  const onStandardUpgrade = async (bet: number, target: number) => {
    if (isUpgrading || !user || user.balance < bet || target <= bet) return;
    setIsUpgrading(true); haptic('heavy');
    setUpgradeResult(null);
    setUser((u) => (u ? { ...u, balance: u.balance - bet } : u));

    try {
      const r = await api.standardUpgrade(bet, target);
      const chanceDeg = (r.chancePercent / 100) * 360;
      let targetAngle = r.win ? Math.random() * chanceDeg : chanceDeg + Math.random() * (360 - chanceDeg);
      
      const targetRotation = 360 - targetAngle;
      let delta = targetRotation - (upgradeWheelRotation % 360);
      if (delta < 0) delta += 360;

      setUpgradeWheelRotation(upgradeWheelRotation + (360 * 30) + delta);

      let resultData;
      if (r.win) {
        const txt = WIN_TEXTS[Math.floor(Math.random() * WIN_TEXTS.length)];
        resultData = { text: txt, type: 'win' as const };
      } else {
        const txt = LOSE_TEXTS[Math.floor(Math.random() * LOSE_TEXTS.length)];
        resultData = { text: txt, type: 'lose' as const };
      }

      setTimeout(() => {
        setUser((u) => (u ? { ...u, balance: r.newBalance } : u));
        setUpgradeResult(resultData); 
        setIsUpgrading(false);
      }, 12500);
    } catch { 
      setIsUpgrading(false); 
      api.me().then(res => setUser(res.user)).catch(console.error); 
    }
  };

  const onMysteryUpgrade = async () => {
    if (isMystery || !user || user.balance < mysteryBet) return;
    setIsMystery(true); haptic('heavy');
    
    setUser((u) => (u ? { ...u, balance: u.balance - mysteryBet } : u));

    try {
      const r = await api.mysteryUpgrade(mysteryBet);
      setTimeout(() => {
        setUser((u) => (u ? { ...u, balance: r.newBalance } : u));
        setPrize({ reward: r.profit, price: 0 });
        setIsMystery(false);
      }, 10000);
    } catch { 
      setIsMystery(false); 
      api.me().then(res => setUser(res.user)).catch(console.error);
    }
  };

  const onSpinWheel = async () => {
    if (isSpinning) return;
    try {
      setIsSpinning(true); haptic('medium');
      const r = await api.spinWheel();
      const index = [50, 100, 200, 500, 1000, 5000].indexOf(r.reward);
      setWheelRotation((prev) => prev + (360 * 10) + (360 - (index * 60)) - 90);
      setTimeout(() => { setIsSpinning(false); setUser((u) => (u ? { ...u, balance: r.balance } : u)); setPrize({ reward: r.reward, price: 0 }); }, 7000);
    } catch { setIsSpinning(false); }
  };

  const onWithdraw = async () => {
    if (!withdrawAmount || withdrawAmount < 1000) return alert('Минимум 1000 монет');
    if (!user || user.balance < withdrawAmount) return alert('Недостаточно монет');
    
    try {
      await api.withdraw(withdrawAmount);
      alert('Заявка на вывод создана! Ожидайте выплату.');
      setWithdrawAmount('');
      api.me().then(r => setUser(r.user));
    } catch (e) {
      alert('Ошибка при создании заявки');
    }
  };

  const sortedGifts = [...giftList].sort((a, b) => {
    return sortOrder === 'asc' ? a.price_stars - b.price_stars : b.price_stars - a.price_stars;
  });
  const visibleGifts = sortedGifts.slice(0, visibleCount);

  useEffect(() => {
    setVisibleCount(20);
  }, [sortOrder, isGiftModalOpen]);

  if (error) return <div className="screen center"><p className="error">{error}</p></div>;
  if (!user) return <div className="screen center"><div className="loader" /></div>;

  const targetPrice = selectedGift ? selectedGift.price_stars : 0;
  const chancePercent = targetPrice > 0 ? Math.min(95, Math.floor((upgradeBet / targetPrice) * 100)) : 0;

  return (
    <div className="screen" style={{ paddingBottom: '70px' }}>
      <header className="top">
        <span className="logo">PADDY<b>CASINO</b></span>
        <span className="who">{user.firstName} | {user.balance.toLocaleString('ru-RU')} 🪙</span>
      </header>

      {showCaseModal && openingCase && (
        <div className="modal" style={{ zIndex: 10000, background: 'rgba(0,0,0,0.95)' }}>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h2 style={{ color: 'var(--win)', marginBottom: '20px' }}>Открываем {openingCase.name}</h2>
            
            <div style={{ width: '100%', height: '120px', background: '#0a0a0c', border: '2px solid var(--win)', borderRadius: '16px', overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center' }}>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: '4px', background: 'var(--win)', zIndex: 10, transform: 'translateX(-50%)', boxShadow: '0 0 15px var(--win)' }} />
              
              <div 
                style={{ 
                  display: 'flex',
                  gap: '10px',
                  padding: '0 20px',
                  transform: `translateX(${caseOffset}px)`,
                  transition: caseRolling ? 'transform 12s cubic-bezier(0.1, 0.9, 0.2, 1)' : 'none'
                }}
              >
                {caseStrip.map((reward, i) => (
                  <div key={i} style={{ 
                    width: '70px', 
                    height: '90px', 
                    background: 'linear-gradient(180deg, #1a1a1f 0%, #0a0a0c 100%)', 
                    border: '1px solid rgba(255, 26, 26, 0.3)', 
                    borderRadius: '8px', 
                    display: 'flex', 
                    flexDirection: 'column',
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    flexShrink: 0,
                    fontSize: '12px',
                    fontWeight: 'bold',
                    color: 'var(--win)',
                    boxShadow: 'inset 0 0 10px rgba(0,0,0,0.8)'
                  }}>
                    <span style={{ fontSize: '20px', marginBottom: '5px' }}>🪙</span>
                    {reward.toLocaleString('ru-RU')}
                  </div>
                ))}
              </div>
            </div>

            {!caseRolling && caseResult !== null && (
              <div style={{ marginTop: '30px', textAlign: 'center', animation: 'fadeIn 0.5s' }}>
                <h3 style={{ color: 'var(--muted)' }}>Вы выиграли:</h3>
                <div style={{ fontSize: '48px', fontWeight: 'bold', color: 'var(--win)', margin: '10px 0', textShadow: '0 0 20px var(--win)' }}>
                  {caseResult.toLocaleString('ru-RU')} 🪙
                </div>
                <button 
                  className="btn" 
                  style={{ padding: '15px 40px', fontSize: '16px', marginTop: '20px' }} 
                  onClick={() => {
                    setShowCaseModal(false);
                    setOpeningCase(null);
                    setCaseResult(null);
                    setCaseOffset(0);
                    setCaseStrip([]);
                  }}
                >
                  Забрать
                </button>
              </div>
            )}
            
            {caseRolling && (
               <div style={{ marginTop: '30px', color: 'var(--muted)' }}>Крутим...</div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'main' && (
        <div className="tab-content center" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <section className="balance">
            <span className="label">Ваш Баланс</span>
            <span className="amount">{user.balance.toLocaleString('ru-RU')}</span>
          </section>
          <section className="tap-zone">
            <button className="tap" onPointerDown={onTap}>
              <span className="coin">🐸</span>
              {pops.map((p) => <span key={p.id} className="pop" style={{ left: p.x, top: p.y }}>+{p.value}</span>)}
            </button>
          </section>
        </div>
      )}

      {activeTab === 'games' && (
        <div className="tab-content">
          {activeGame !== 'none' ? (
            <div className="game-view">
              <button className="back-btn" onClick={() => { setActiveGame('none'); setSelectedGift(null); }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                Назад
              </button>

              {activeGame === 'standard' && (
                <div className="game-content">
                  <h2 style={{ textAlign: 'center', color: 'var(--win)', marginBottom: '20px' }}>Улучшение подарка</h2>
                  
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Ваша ставка (в монетах):</label>
                    <input type="number" value={upgradeBet} onChange={e => setUpgradeBet(Number(e.target.value))} className="input" />
                  </div>

                  <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Цель апгрейда:</label>
                  
                  <button 
                    className="btn" 
                    style={{ width: '100%', padding: '15px', marginBottom: '15px', background: 'var(--card)', border: '1px solid var(--line)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
                    onClick={() => setIsGiftModalOpen(true)}
                  >
                    {selectedGift ? (
                      <>
                        <div style={{ width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                           <LottiePlayer url={selectedGift.animation_url} style={{ width: '100%', height: '100%' }} />
                        </div>
                        <span>{selectedGift.name}</span>
                        <span style={{ color: 'var(--win)', marginLeft: 'auto' }}>{selectedGift.price_stars} ⭐</span>
                      </>
                    ) : (
                      'Выбрать подарок'
                    )}
                  </button>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '20px 0' }}>
                    <div className="upgrade-wheel-container">
                      <div className="upgrade-wheel-pointer" />
                      <div className="upgrade-wheel" style={{ transform: `rotate(${upgradeWheelRotation}deg)`, transition: isUpgrading ? 'transform 12.5s cubic-bezier(0.15, 0.9, 0.15, 1)' : 'none' }}>
                        <div className="upgrade-wheel-gradient" style={{ 
                          background: `
                            conic-gradient(from 0deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.5) 100%),
                            conic-gradient(from 0deg, rgba(255, 26, 26, 1) 0%, rgba(255, 26, 26, 0.2) ${chancePercent}%, transparent ${chancePercent}%, transparent 100%)
                          `
                        }} />
                        <div className="upgrade-wheel-inner">
                          
                          <div className="upgrade-wheel-text" style={{ transform: `rotate(-${upgradeWheelRotation}deg)`, transition: isUpgrading ? 'transform 12.5s cubic-bezier(0.15, 0.9, 0.15, 1)' : 'none' }}>
                            {upgradeResult ? (
                              <span className={`result-text ${upgradeResult.type}`}>
                                {upgradeResult.text}
                              </span>
                            ) : (
                              <>
                                <span style={{ fontSize: '26px', fontWeight: '300', letterSpacing: '1px' }}>{chancePercent}%</span>
                                <span style={{ fontSize: '9px', color: 'var(--muted)', letterSpacing: '4px', marginTop: '4px', fontWeight: '400', textTransform: 'uppercase' }}>шанс</span>
                              </>
                            )}
                          </div>

                        </div>
                      </div>
                    </div>
                  </div>

                  <button 
                    className="btn" 
                    style={{ width: '100%', padding: '15px' }} 
                    disabled={isUpgrading || !selectedGift || upgradeBet >= targetPrice} 
                    onClick={() => {
                      if (selectedGift) onStandardUpgrade(upgradeBet, targetPrice);
                    }}
                  >
                    {isUpgrading ? 'Крутим...' : !selectedGift ? 'Выберите подарок' : upgradeBet >= targetPrice ? 'Ставка слишком велика' : `Апгрейд на ${selectedGift.name}`}
                  </button>
                </div>
              )}

              {activeGame === 'mystery' && (
                <div className="game-content">
                  <h2 style={{ textAlign: 'center', color: 'var(--win)', marginBottom: '20px' }}>Mystery Upgrade</h2>
                  <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Ставка:</label>
                  <input type="number" value={mysteryBet} onChange={e => setMysteryBet(Number(e.target.value))} className="input" style={{ marginBottom: '20px' }} />
                  <p style={{ fontSize: '13px', color: 'var(--muted)', textAlign: 'center', marginBottom: '30px' }}>
                    Выигрыш от {Math.floor(mysteryBet / 10)} до {mysteryBet * 10} 🪙!
                  </p>
                  {isMystery ? (
                    <div style={{ height: '150px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <div className="mystery-orb" />
                      <div style={{ marginTop: '15px', fontSize: '14px', color: 'var(--muted)' }}>Магия творится...</div>
                    </div>
                  ) : (
                    <button className="btn" disabled={isMystery} onClick={onMysteryUpgrade} style={{ width: '100%', padding: '15px' }}>
                      Испытать удачу
                    </button>
                  )}
                </div>
              )}

              {activeGame === 'cases' && (
                <div className="game-content">
                  <h2 style={{ textAlign: 'center', color: 'var(--win)', marginBottom: '20px' }}>Кейсы</h2>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {cases.map((c) => (
                      <div 
                        key={c.id} 
                        style={{ 
                          background: 'var(--card)', 
                          border: '1px solid var(--line)', 
                          borderRadius: '16px', 
                          overflow: 'hidden',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          padding: '10px',
                          position: 'relative'
                        }}
                      >
                        <div style={{ width: '100%', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                          {/* ИСПОЛЬЗУЕМ LOTTIE АНИМАЦИЮ ДЛЯ КЕЙСОВ */}
                          <LottiePlayer url={c.animation_url} style={{ width: '100%', height: '100%' }} />
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '5px', textAlign: 'center' }}>{c.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '10px' }}>
                          {c.currency === 'coins' ? `${c.price_coins.toLocaleString('ru-RU')} 🪙` : `${c.price_stars} ⭐`}
                        </div>
                        <button 
                          className="btn" 
                          style={{ width: '100%', padding: '10px', fontSize: '13px' }}
                          disabled={
                            (c.currency === 'coins' && user.balance < c.price_coins) ||
                            (c.currency === 'stars') ||
                            caseRolling
                          }
                          onClick={() => {
                            if (c.currency === 'coins') {
                              onOpenCase(c);
                            } else {
                              alert('Покупка за звезды скоро появится!');
                            }
                          }}
                        >
                          {c.currency === 'stars' ? 'Скоро' : `Открыть`}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeGame === 'wheel' && (
                <div className="game-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <h2 style={{ textAlign: 'center', color: 'var(--win)', marginBottom: '30px' }}>Колесо Фортуны</h2>
                  <div style={{ position: 'relative', width: '240px', height: '240px', marginBottom: '30px' }}>
                    <div style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', width: '0', height: '0', borderLeft: '15px solid transparent', borderRight: '15px solid transparent', borderTop: '25px solid var(--win)', zIndex: 10 }} />
                    <div className="wheel" style={{ transform: `rotate(${wheelRotation}deg)`, transition: isSpinning ? 'transform 7s cubic-bezier(0.1, 0.9, 0.2, 1)' : 'none', width: '100%', height: '100%' }}>
                      <div className="wheel-sector" style={{ transform: 'rotate(0deg)' }}>50</div>
                      <div className="wheel-sector" style={{ transform: 'rotate(60deg)' }}>100</div>
                      <div className="wheel-sector" style={{ transform: 'rotate(120deg)' }}>200</div>
                      <div className="wheel-sector" style={{ transform: 'rotate(180deg)' }}>500</div>
                      <div className="wheel-sector" style={{ transform: 'rotate(240deg)' }}>1000</div>
                      <div className="wheel-sector" style={{ transform: 'rotate(300deg)' }}>5000</div>
                    </div>
                  </div>
                  <button className="btn" style={{ width: '100%', padding: '15px' }} disabled={isSpinning} onClick={onSpinWheel}>
                    {isSpinning ? 'Крутится...' : 'Крутить'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="game-grid">
              <div className="game-card card-standard" onClick={() => setActiveGame('standard')}>
                <div className="game-card-content">
                  <span className="hit-badge">🔥 ХИТ</span>
                  <h2>Улучшение</h2>
                  <p>Выбери подарок мечты</p>
                </div>
                <div className="game-card-bg standard-bg">
                   <div className="radar-circle" />
                   <div className="radar-sweep" />
                   <div className="game-emoji">💎</div>
                </div>
              </div>

              <div className="game-card card-mystery" onClick={() => setActiveGame('mystery')}>
                <div className="game-card-content">
                  <h2>Mystery</h2>
                  <p>Случайный куш</p>
                </div>
                <div className="game-card-bg mystery-bg"><div className="game-emoji">❓</div></div>
              </div>

              <div className="game-card card-cases" onClick={() => setActiveGame('cases')}>
                <div className="game-card-content">
                  <h2>Кейсы</h2>
                  <p>Испытай удачу</p>
                </div>
                <div className="game-card-bg cases-bg"><div className="game-emoji">🎁</div></div>
              </div>

              <div className="game-card card-wheel" onClick={() => setActiveGame('wheel')}>
                <div className="game-card-content">
                  <h2>Колесо</h2>
                  <p>Крути на удачу</p>
                </div>
                <div className="game-card-bg wheel-bg"><div className="game-emoji">🎡</div></div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="tab-content center" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: '64px', marginBottom: '20px' }}>👤</div>
          <h2>Привет, {user.firstName}!</h2>
          <p style={{ color: 'var(--muted)' }}>ID: {user.id}</p>
          
          <div style={{ marginTop: '20px', padding: '20px', background: 'var(--card)', borderRadius: '16px', width: '100%', textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 10px 0' }}>Пригласи друга</h3>
            <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '15px' }}>Получите по 5000 🪙 за каждого друга!</p>
            <button 
              className="btn" 
              style={{ width: '100%' }}
              onClick={() => {
                const refLink = `https://t.me/s0mber_Flop_bot/play?startapp=ref_${user.id}`;
                (window as any).Telegram?.WebApp?.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(refLink)}`);
              }}
            >
              Пригласить
            </button>
          </div>
        </div>
      )}

      {activeTab === 'withdraw' && (
        <div className="tab-content center">
          <div style={{ fontSize: '64px', marginBottom: '20px' }}>💸</div>
          <h2>Вывод средств</h2>
          <p style={{ color: 'var(--muted)', textAlign: 'center', marginBottom: '20px' }}>
            Обменяйте монеты на Telegram Stars. <br/> Курс: 1000 🪙 = 10 ⭐
          </p>
          
          <div style={{ width: '100%', padding: '20px', background: 'var(--card)', borderRadius: '16px' }}>
            <label style={{ fontSize: '11px', color: 'var(--muted)' }}>Сумма (мин. 1000):</label>
            <input 
              type="number" 
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(Number(e.target.value))}
              placeholder="1000"
              className="input" 
              style={{ marginBottom: '15px' }} 
            />
            <button 
              className="btn" 
              style={{ width: '100%' }}
              onClick={onWithdraw}
            >
              Создать заявку
            </button>
          </div>
        </div>
      )}

      {isGiftModalOpen && (
        <div className="modal" onClick={() => setIsGiftModalOpen(false)}>
          <div className="modal-card" style={{ maxWidth: '400px', width: '90%', maxHeight: '80vh', overflowY: 'auto', background: 'var(--bg)', border: '1px solid var(--line)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, marginBottom: '10px', color: 'var(--win)', textAlign: 'center' }}>Выберите подарок</h3>
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
              <button 
                className="btn" 
                style={{ flex: 1, padding: '8px', fontSize: '12px', background: sortOrder === 'asc' ? 'var(--win)' : 'var(--card)', color: sortOrder === 'asc' ? '#fff' : 'var(--muted)' }}
                onClick={() => setSortOrder('asc')}
              >
                Дешевые
              </button>
              <button 
                className="btn" 
                style={{ flex: 1, padding: '8px', fontSize: '12px', background: sortOrder === 'desc' ? 'var(--win)' : 'var(--card)', color: sortOrder === 'desc' ? '#fff' : 'var(--muted)' }}
                onClick={() => setSortOrder('desc')}
              >
                Дорогие
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {visibleGifts.map((g) => {
                const isSelected = selectedGift?.id === g.id;
                return (
                  <div 
                    key={g.id} 
                    onClick={() => {
                       haptic('light');
                       setSelectedGift(g);
                       setIsGiftModalOpen(false);
                    }}
                    style={{ 
                      padding: '10px', borderRadius: '12px', 
                      background: isSelected ? 'rgba(255, 26, 26, 0.1)' : 'var(--card)',
                      border: isSelected ? '1px solid var(--win)' : '1px solid var(--line)',
                      cursor: 'pointer', textAlign: 'center',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <LottiePlayer url={g.animation_url} style={{ width: '100%', height: '100%' }} />
                    </div>
                    
                    <div style={{ fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>{g.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--win)', fontWeight: 'bold' }}>{g.price_stars} ⭐</div>
                  </div>
                );
              })}
            </div>

            {visibleCount < sortedGifts.length && (
              <button 
                className="btn" 
                style={{ width: '100%', marginTop: '15px', background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--line)' }} 
                onClick={() => setVisibleCount(prev => prev + 20)}
              >
                Показать еще 20
              </button>
            )}
            
            <button className="btn" style={{ width: '100%', marginTop: '10px', background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--line)' }} onClick={() => setIsGiftModalOpen(false)}>
              Закрыть
            </button>
          </div>
        </div>
      )}

      {prize && (
        <div className="modal" onClick={() => setPrize(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-emoji">{prize.reward >= 0 ? '🎉' : '💀'}</div>
            <div className="modal-title">{prize.reward >= 0 ? 'Вы получили' : 'Вы потеряли'}</div>
            <div className="modal-prize" style={{ color: prize.reward >= 0 ? 'var(--win)' : 'var(--muted)' }}>
              {prize.reward >= 0 ? '+' : ''}{prize.reward.toLocaleString('ru-RU')}
            </div>
            <button className="btn" onClick={() => setPrize(null)}>Забрать</button>
          </div>
        </div>
      )}

      <nav className="bottom-nav">
        <button className={activeTab === 'main' ? 'active' : ''} onClick={() => { setActiveTab('main'); setActiveGame('none'); }}><span>🏠</span><br/><small>Кликер</small></button>
        <button className={activeTab === 'games' ? 'active' : ''} onClick={() => setActiveTab('games')}><span>🎮</span><br/><small>Игры</small></button>
        <button className={activeTab === 'withdraw' ? 'active' : ''} onClick={() => { setActiveTab('withdraw'); setActiveGame('none'); }}><span>💸</span><br/><small>Вывод</small></button>
        <button className={activeTab === 'profile' ? 'active' : ''} onClick={() => { setActiveTab('profile'); setActiveGame('none'); }}><span>👤</span><br/><small>Профиль</small></button>
      </nav>
    </div>
  );
}