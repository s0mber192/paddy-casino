import { FastifyInstance } from 'fastify';

// ОГРОМНЫЙ СПИСОК ПОДАРКОВ (100+ штук) из Virus Game Bot
const GIFTS = [
  { id: 164, name: 'Heart Locket', stars: 174842, anim: 'https://proxy-cdn.virusgift.pro/heartlocket.json?v=1' },
  { id: 214, name: 'Resistance Dog', stars: 72695, anim: 'https://proxy-cdn.virusgift.pro/ResistanceDog.json?v=1' },
  { id: 3, name: "Durov's Cap", stars: 55993, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-3.json?v=1' },
  { id: 65, name: 'Precious Peach', stars: 35147, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-65.json?v=1' },
  { id: 68, name: 'Scared Cat', stars: 34007, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-68.json?v=1' },
  { id: 150, name: 'Heroic Helmet', stars: 25948, anim: 'https://proxy-cdn.virusgift.pro/HeroicHelmet.json?v=1' },
  { id: 149, name: 'Mighty Arm', stars: 18108, anim: 'https://proxy-cdn.virusgift.pro/MightyArm.json?v=1' },
  { id: 13, name: 'Loot Bag', stars: 17471, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-13.json?v=1' },
  { id: 40, name: 'Astral Shard', stars: 16749, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-40.json?v=1' },
  { id: 105, name: 'Nail Bracelet', stars: 16045, anim: 'https://proxy-cdn.virusgift.pro/nail-bracelet.json?v=1' },
  { id: 130, name: 'Westside Sign', stars: 15567, anim: 'https://proxy-cdn.virusgift.pro/westside-sign.json?v=1' },
  { id: 64, name: 'Perfume Bottle', stars: 10114, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-64.json?v=1' },
  { id: 62, name: 'Mini Oscar', stars: 9877, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-62.json?v=1' },
  { id: 53, name: 'Ion Gem', stars: 9237, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-53.json?v=1' },
  { id: 148, name: 'Artisan Brick', stars: 8933, anim: 'https://proxy-cdn.virusgift.pro/ArtisanBrick.json?v=1' },
  { id: 108, name: 'Gem Signet', stars: 8625, anim: 'https://proxy-cdn.virusgift.pro/gem-signet.json?v=1' },
  { id: 129, name: 'Low Rider', stars: 8240, anim: 'https://proxy-cdn.virusgift.pro/low-rider.json?v=1' },
  { id: 77, name: 'Swiss Watch', stars: 7856, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-77.json?v=1' },
  { id: 61, name: 'Magic Potion', stars: 7833, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-61.json?v=1' },
  { id: 69, name: 'Sharp Tongue', stars: 6362, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-69.json?v=1' },
  { id: 57, name: 'Kissed Frog', stars: 5931, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-57.json?v=1' },
  { id: 101, name: 'Bonded Ring', stars: 5865, anim: 'https://proxy-cdn.virusgift.pro/bonded-ring.json?v=1' },
  { id: 20, name: 'Vintage Cigar', stars: 5276, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-20.json?v=1' },
  { id: 27, name: 'Neko Helmet', stars: 5084, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-27.json?v=1' },
  { id: 23, name: 'Voodoo Doll', stars: 5042, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-23.json?v=1' },
  { id: 49, name: 'Genie Lamp', stars: 5035, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-49.json?v=1' },
  { id: 1, name: 'Toy Bear', stars: 4737, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-1.json?v=1' },
  { id: 70, name: 'Signet Ring', stars: 4593, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-70.json?v=1' },
  { id: 5, name: 'Diamond Ring', stars: 4447, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-5.json?v=1' },
  { id: 196, name: 'Rare Bird', stars: 3889, anim: 'https://proxy-cdn.virusgift.pro/rare-bird.json?v=1' },
  { id: 37, name: 'Electric Skull', stars: 3767, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-37.json?v=1' },
  { id: 47, name: 'Eternal Rose', stars: 3513, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-47.json?v=1' },
  { id: 162, name: 'Bling Binky', stars: 3411, anim: 'https://proxy-cdn.virusgift.pro/blingbinky.json?v=1' },
  { id: 172, name: "Khabib's Papakha", stars: 3387, anim: 'https://proxy-cdn.virusgift.pro/KhabibsPapakha.json?v=1' },
  { id: 137, name: 'Cupid Charm', stars: 3051, anim: 'https://proxy-cdn.virusgift.pro/cupid-charm.json?v=1' },
  { id: 153, name: 'Sky Stilettos', stars: 2670, anim: 'https://proxy-cdn.virusgift.pro/SkyStilettos.json?v=1' },
  { id: 215, name: 'Lucky Locket', stars: 2418, anim: 'https://proxy-cdn.virusgift.pro/LuckyLocket.json?v=1' },
  { id: 78, name: 'Trapped Heart', stars: 2220, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-78.json?v=1' },
  { id: 178, name: 'UFC Strike', stars: 2127, anim: 'https://proxy-cdn.virusgift.pro/ufc_strike.json?v=1' },
  { id: 128, name: 'Snoop Cigar', stars: 2102, anim: 'https://proxy-cdn.virusgift.pro/snoop-сigar.json?v=1' },
  { id: 21, name: 'Love Potion', stars: 2001, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-21.json?v=1' },
  { id: 146, name: 'Ionic Dryer', stars: 1968, anim: 'https://proxy-cdn.virusgift.pro/ionic-dryer.json?v=1' },
  { id: 60, name: 'Mad Pumpkin', stars: 1889, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-60.json?v=1' },
  { id: 48, name: 'Flying Broom', stars: 1760, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-48.json?v=1' },
  { id: 45, name: 'Crystal Ball', stars: 1728, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-45.json?v=1' },
  { id: 66, name: 'Record Player', stars: 1714, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-66.json?v=1' },
  { id: 71, name: 'Skull Flower', stars: 1640, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-71.json?v=1' },
  { id: 136, name: 'Valentine Box', stars: 1612, anim: 'https://proxy-cdn.virusgift.pro/valentine-box.json?v=1' },
  { id: 58, name: 'Love Candle', stars: 1523, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-58.json?v=1' },
  { id: 26, name: 'Sakura Flower', stars: 1454, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-26.json?v=1' },
  { id: 56, name: 'Jingle Bells', stars: 1407, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-56.json?v=1' },
  { id: 22, name: 'Top Hat', stars: 1365, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-22.json?v=1' },
  { id: 50, name: 'Hanging Star', stars: 1295, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-50.json?v=1' },
  { id: 42, name: 'Berry Box', stars: 1222, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-42.json?v=1' },
  { id: 208, name: 'Fine Pen', stars: 1143, anim: 'https://proxy-cdn.virusgift.pro/FinePen.json?v=1' },
  { id: 72, name: 'Sleigh Bell', stars: 1116, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-72.json?v=1' },
  { id: 43, name: 'Bunny Muffin', stars: 1110, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-43.json?v=1' },
  { id: 135, name: 'Joyful Bundle', stars: 1091, anim: 'https://proxy-cdn.virusgift.pro/joyful-bundle.json?v=1' },
  { id: 54, name: 'Jelly Bunny', stars: 1089, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-54.json?v=1' },
  { id: 24, name: 'Evil Eye', stars: 1059, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-24.json?v=1' },
  { id: 144, name: 'Jolly Chimp', stars: 991, anim: 'https://proxy-cdn.virusgift.pro/monkey.json?v=1' },
  { id: 109, name: 'Light Sword', stars: 920, anim: 'https://proxy-cdn.virusgift.pro/light-sword.json?v=1' },
  { id: 206, name: 'Surge Board', stars: 912, anim: 'https://proxy-cdn.virusgift.pro/SurgeBoard.json?v=1' },
  { id: 145, name: 'Moon Pendant', stars: 858, anim: 'https://proxy-cdn.virusgift.pro/moon-pendant.json?v=1' },
  { id: 147, name: 'Input Key', stars: 844, anim: 'https://proxy-cdn.virusgift.pro/inputkey.json?v=1' },
  { id: 134, name: 'Lush Bouquet', stars: 841, anim: 'https://proxy-cdn.virusgift.pro/lush-bouquet.json?v=1' },
  { id: 79, name: 'Witch Hat', stars: 839, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-79.json?v=1' },
  { id: 46, name: 'Eternal Candle', stars: 835, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-46.json?v=1' },
  { id: 11, name: 'Desk Calendar', stars: 822, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-11.json?v=1' },
  { id: 158, name: 'Spring Basket', stars: 807, anim: 'https://proxy-cdn.virusgift.pro/SpringBasket.json?v=1' },
  { id: 75, name: 'Spy Agaric', stars: 795, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-75.json?v=1' },
  { id: 165, name: 'Pretty Posy', stars: 788, anim: 'https://proxy-cdn.virusgift.pro/prettyposy.json?v=1' },
  { id: 125, name: 'Snoop Dogg', stars: 783, anim: 'https://proxy-cdn.virusgift.pro/snoop-dogg.json?v=1' },
  { id: 39, name: 'Snow Globe', stars: 779, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-39.json?v=1' },
  { id: 156, name: 'Faith Amulet', stars: 770, anim: 'https://proxy-cdn.virusgift.pro/FaithAmulet.json?v=1' },
  { id: 73, name: 'Snow Mittens', stars: 757, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-73.json?v=1' },
  { id: 143, name: 'Stellar Rocket', stars: 735, anim: 'https://proxy-cdn.virusgift.pro/racket.json?v=1' },
  { id: 67, name: 'Santa Hat', stars: 728, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-67.json?v=1' },
  { id: 126, name: 'Swag Bag', stars: 727, anim: 'https://proxy-cdn.virusgift.pro/swag-bag.json?v=1' },
  { id: 52, name: 'Homemade Cake', stars: 727, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-52.json?v=1' },
  { id: 107, name: 'Restless Jar', stars: 727, anim: 'https://proxy-cdn.virusgift.pro/restless-jar.json?v=1' },
  { id: 207, name: 'Liberty Figure', stars: 722, anim: 'https://proxy-cdn.virusgift.pro/LibertyFigure.json?v=1' },
  { id: 163, name: 'Money Pot', stars: 719, anim: 'https://proxy-cdn.virusgift.pro/moneypot.json?v=1' },
  { id: 112, name: 'Bow Tie', stars: 713, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-112.json?v=1' },
  { id: 81, name: 'Jack-in-the-Box', stars: 705, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-81.json?v=1' },
  { id: 155, name: 'Mousse Cake', stars: 696, anim: 'https://proxy-cdn.virusgift.pro/MousseCake.json?v=1' },
  { id: 152, name: 'Clover Pin', stars: 678, anim: 'https://proxy-cdn.virusgift.pro/CloverPin.json?v=1' },
  { id: 41, name: 'B-Day Candle', stars: 672, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-41.json?v=1' },
  { id: 51, name: 'Hex Pot', stars: 671, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-51.json?v=1' },
  { id: 44, name: 'Cookie Heart', stars: 668, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-44.json?v=1' },
  { id: 195, name: 'Victory Medal', stars: 665, anim: 'https://proxy-cdn.virusgift.pro/victory-medal.json?v=1' },
  { id: 213, name: 'Mirage Lamp', stars: 659, anim: 'https://proxy-cdn.virusgift.pro/MirageLamp.json?v=1' },
  { id: 76, name: 'Star Notepad', stars: 623, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-76.json?v=1' },
  { id: 63, name: 'Party Sparkler', stars: 609, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-63.json?v=1' },
  { id: 201, name: 'Timeless Book', stars: 609, anim: 'https://proxy-cdn.virusgift.pro/TimelessBook.json?v=1' },
  { id: 151, name: 'Fresh Socks', stars: 609, anim: 'https://proxy-cdn.virusgift.pro/sock.json?v=1' },
  { id: 74, name: 'Spiced Wine', stars: 605, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-74.json?v=1' },
  { id: 198, name: 'Mood Pack', stars: 594, anim: 'https://proxy-cdn.virusgift.pro/MoodPack.json?v=1' },
  { id: 35, name: 'Winter Wreath', stars: 590, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-35.json?v=1' },
  { id: 4, name: 'Ginger Cookie', stars: 589, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-4.json?v=1' },
  { id: 154, name: 'Happy Brownie', stars: 578, anim: 'https://proxy-cdn.virusgift.pro/HappyBrownie.json?v=1' },
  { id: 87, name: 'Easter Egg', stars: 576, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-87.json?v=1' },
  { id: 38, name: 'Tama Gadget', stars: 572, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-38.json?v=1' },
  { id: 28, name: 'Hypno Lollipop', stars: 570, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-28.json?v=1' },
  { id: 55, name: 'Jester Hat', stars: 564, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-55.json?v=1' },
  { id: 103, name: 'Pet Snake', stars: 545, anim: 'https://proxy-cdn.virusgift.pro/pet-snake.json?v=1' },
  { id: 122, name: 'Holiday Drink', stars: 543, anim: 'https://proxy-cdn.virusgift.pro/holiday-drink.json?v=1' },
  { id: 36, name: 'Candy Cane', stars: 538, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-36.json?v=1' },
  { id: 133, name: 'Whip Cupcake', stars: 537, anim: 'https://proxy-cdn.virusgift.pro/whip-cupcake.json?v=1' },
  { id: 25, name: 'Lol Pop', stars: 533, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-25.json?v=1' },
  { id: 202, name: 'Vice Cream', stars: 533, anim: 'https://proxy-cdn.virusgift.pro/ViceCream.json?v=1' },
  { id: 157, name: 'Instant Ramen', stars: 532, anim: 'https://proxy-cdn.virusgift.pro/InstantRamen.json?v=1' },
  { id: 102, name: 'Big Year', stars: 532, anim: 'https://proxy-cdn.virusgift.pro/big-year.json?v=1' },
  { id: 106, name: 'Snake Box', stars: 532, anim: 'https://proxy-cdn.virusgift.pro/snake-box.json?v=1' },
  { id: 104, name: 'Xmas Stocking', stars: 532, anim: 'https://proxy-cdn.virusgift.pro/xmas-stocking.json?v=1' },
  { id: 159, name: 'Ice Cream', stars: 531, anim: 'https://proxy-cdn.virusgift.pro/IceCream.json?v=1' },
  { id: 200, name: 'Chill Flame', stars: 530, anim: 'https://proxy-cdn.virusgift.pro/ChillFlame.json?v=1' },
  { id: 199, name: 'Pool Float', stars: 528, anim: 'https://proxy-cdn.virusgift.pro/PoolFloat.json?v=1' },
  { id: 59, name: 'Lunar Snake', stars: 523, anim: 'https://proxy-cdn.virusgift.pro/telegram-gift-sticker-59.json?v=1' },
];

export async function giftsRoutes(app: FastifyInstance) {
  
  // Прокси для Lottie-анимаций
  app.get('/api/gifts/animation/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const gift = GIFTS.find(g => g.id === Number(id));
    
    if (!gift) return reply.code(404).send({ error: 'NOT_FOUND' });

    try {
      const res = await fetch(gift.anim, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (!res.ok) throw new Error('Animation not found');
      return await res.json();
    } catch (e) {
      req.log.error(`Animation proxy error for ${id}: ${e}`);
      return reply.code(404).send({ error: 'ANIMATION_NOT_FOUND' });
    }
  });

  // Список подарков (с ценами в Stars)
  app.get('/api/gifts/list', async () => {
    return GIFTS.map(g => ({
      id: g.id.toString(),
      name: g.name,
      price_stars: g.stars,
      animation_url: `/api/gifts/animation/${g.id}`,
    }));
  });
}