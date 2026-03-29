// 前端页面/auth/国家地区数据.js
// ==========================================
// 🌍 国家地区数据
// ==========================================
// 作用：提供注册表单中的国家和地区选项
// 关联文件：注册表单组件.js、个人设置表单组件.js
// ==========================================
// 🏗️ 优化：扩充国家数量，按地区分组
// ==========================================

// ==========================================
// 🌏 亚洲 (Asia)
// ==========================================
const ASIA = {
    "中国": [
        "北京", "天津", "河北", "山西", "内蒙古", "辽宁", "吉林", "黑龙江", 
        "上海", "江苏", "浙江", "安徽", "福建", "江西", "山东", "河南", 
        "湖北", "湖南", "广东", "广西", "海南", "重庆", "四川", "贵州", 
        "云南", "西藏", "陕西", "甘肃", "青海", "宁夏", "新疆", 
        "台湾", "香港", "澳门", "其他地区"
    ],
    "日本": [
        "東京", "大阪", "京都", "北海道", "横浜", "名古屋", "神戸", 
        "福岡", "沖縄", "広島", "仙台", "札幌", "その他の地域"
    ],
    "대한민국": [
        "서울", "부산", "인천", "대구", "대전", "광주", "울산", 
        "세종", "경기도", "강원도", "제주", "기타 지역"
    ],
    "भारत": [
        "नई दिल्ली", "मुंबई", "बेंगलुरु", "हैदराबाद", "चेन्नई", 
        "कोलकाता", "पुणे", "अहमदाबाद", "जयपुर", "अन्य क्षेत्र"
    ],
    "Indonesia": [
        "Jakarta", "Bali", "Surabaya", "Bandung", "Medan", 
        "Yogyakarta", "Semarang", "Makassar", "Daerah lainnya"
    ],
    "ประเทศไทย": [
        "กรุงเทพมหานคร", "เชียงใหม่", "ภูเก็ต", "พัทยา", "เกาะสมุย", 
        "อยุธยา", "ขอนแก่น", "หาดใหญ่", "พื้นที่อื่นๆ"
    ],
    "Việt Nam": [
        "Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng", "Hải Phòng", 
        "Nha Trang", "Đà Lạt", "Huế", "Cần Thơ", "Các khu vực khác"
    ],
    "Malaysia": [
        "Kuala Lumpur", "Pulau Pinang", "Johor Bahru", "Melaka", 
        "Kota Kinabalu", "Kuching", "Ipoh", "Kawasan lain"
    ],
    "Singapore": ["Singapore"],
    "Pilipinas": [
        "Maynila", "Cebu", "Davao", "Boracay", "Quezon City", 
        "Makati", "Ibang mga rehiyon"
    ],
    "پاکستان": [
        "کراچی", "لاہور", "اسلام آباد", "راولپنڈی", "فیصل آباد", "دیگر علاقے"
    ],
    "বাংলাদেশ": [
        "ঢাকা", "চট্টগ্রাম", "খুলনা", "রাজশাহী", "সিলেট", "অন্যান্য অঞ্চল"
    ],
    "ישראל": [
        "תל אביב", "ירושלים", "חיפה", "באר שבע", "אזורים אחרים"
    ],
    "المملكة العربية السعودية": [
        "الرياض", "جدة", "مكة المكرمة", "المدينة المنورة", "الدمام", "مناطق أخرى"
    ],
    "الإمارات العربية المتحدة": [
        "دبي", "أبوظبي", "الشارقة", "العين", "مناطق أخرى"
    ],
    "ایران": [
        "تهران", "اصفهان", "شیراز", "مشهد", "تبریز", "سایر مناطق"
    ],
    "Türkiye": [
        "İstanbul", "Ankara", "İzmir", "Antalya", "Bursa", "Diğer bölgeler"
    ],
    "မြန်မာ": [
        "ရန်ကုန်", "မန္တလေး", "နေပြည်တော်", "ပုဂံ", "အခြားဒေသများ"
    ],
    "ປະເທດລາວ": [
        "ວຽງຈັນ", "ຫຼວງພະບາງ", "ປາກເຊ", "ເຂດອື່ນໆ"
    ],
    "កម្ពុជា": [
        "ភ្នំពេញ", "សៀមរាប", "ព្រះសីហនុ", "បាត់ដំបង", "តំបន់ផ្សេងទៀត"
    ],
    "नेपाल": [
        "काठमाडौं", "पोखरा", "ललितपुर", "अन्य क्षेत्र"
    ],
    "ශ්‍රී ලංකාව": [
        "කොළඹ", "කැන්ඩි", "ගාල්ල", "වෙනත් ප්‍රදේශ"
    ],
    "Монгол улс": [
        "Улаанбаатар", "Дархан", "Эрдэнэт", "Бусад бүс нутаг"
    ],
    "Қазақстан": [
        "Алматы", "Нұр-Сұлтан", "Шымкент", "Қарағанды", "Басқа аймақтар"
    ]
};

// ==========================================
// 🌍 欧洲 (Europe)
// ==========================================
const EUROPE = {
    "United Kingdom": [
        "London", "Manchester", "Birmingham", "Edinburgh", "Glasgow", 
        "Liverpool", "Leeds", "Bristol", "Cardiff", "Belfast", "Other regions"
    ],
    "France": [
        "Paris", "Lyon", "Marseille", "Nice", "Toulouse", 
        "Bordeaux", "Strasbourg", "Lille", "Nantes", "Autres régions"
    ],
    "Deutschland": [
        "Berlin", "München", "Hamburg", "Frankfurt", "Köln", 
        "Stuttgart", "Düsseldorf", "Dresden", "Leipzig", "Andere Regionen"
    ],
    "Italia": [
        "Roma", "Milano", "Napoli", "Torino", "Firenze", 
        "Venezia", "Bologna", "Altre regioni"
    ],
    "España": [
        "Madrid", "Barcelona", "Valencia", "Sevilla", "Málaga", 
        "Bilbao", "Granada", "Otras regiones"
    ],
    "Россия": [
        "Москва", "Санкт-Петербург", "Новосибирск", "Екатеринбург", 
        "Казань", "Нижний Новгород", "Владивосток", "Сочи", "Другие регионы"
    ],
    "Nederland": [
        "Amsterdam", "Rotterdam", "Den Haag", "Utrecht", "Andere regio's"
    ],
    "Polska": [
        "Warszawa", "Kraków", "Gdańsk", "Wrocław", "Poznań", "Inne regiony"
    ],
    "Україна": [
        "Київ", "Харків", "Одеса", "Львів", "Дніпро", "Інші регіони"
    ],
    "België / Belgique": [
        "Brussel", "Antwerpen", "Gent", "Brugge", "Andere regio's"
    ],
    "Schweiz / Suisse": [
        "Zürich", "Genève", "Basel", "Bern", "Autres régions"
    ],
    "Österreich": [
        "Wien", "Salzburg", "Innsbruck", "Graz", "Andere Regionen"
    ],
    "Sverige": [
        "Stockholm", "Göteborg", "Malmö", "Uppsala", "Andra regioner"
    ],
    "Norge": [
        "Oslo", "Bergen", "Trondheim", "Stavanger", "Andre regioner"
    ],
    "Danmark": [
        "København", "Aarhus", "Odense", "Aalborg", "Andre regioner"
    ],
    "Suomi": [
        "Helsinki", "Espoo", "Tampere", "Turku", "Muut alueet"
    ],
    "Portugal": [
        "Lisboa", "Porto", "Faro", "Coimbra", "Outras regiões"
    ],
    "Ελλάδα": [
        "Αθήνα", "Θεσσαλονίκη", "Κρήτη", "Σαντορίνη", "Άλλες περιοχές"
    ],
    "Česká republika": [
        "Praha", "Brno", "Ostrava", "Plzeň", "Jiné regiony"
    ],
    "România": [
        "București", "Cluj-Napoca", "Timișoara", "Brașov", "Alte regiuni"
    ],
    "Magyarország": [
        "Budapest", "Debrecen", "Szeged", "Pécs", "Más régiók"
    ],
    "Ireland": [
        "Dublin", "Cork", "Galway", "Limerick", "Other regions"
    ],
    "Ísland": [
        "Reykjavík", "Akureyri", "Önnur svæði"
    ]
};

// ==========================================
// 🌎 北美洲 (North America)
// ==========================================
const NORTH_AMERICA = {
    "United States": [
        "California", "New York", "Texas", "Florida", "Washington", 
        "Illinois", "Pennsylvania", "Ohio", "Georgia", "Michigan", 
        "New Jersey", "Massachusetts", "Arizona", "Colorado", 
        "Hawaii", "Alaska", "Nevada", "Oregon", "Other states"
    ],
    "Canada": [
        "Toronto", "Vancouver", "Montréal", "Calgary", "Ottawa", 
        "Edmonton", "Winnipeg", "Québec City", "Halifax", "Other regions"
    ],
    "México": [
        "Ciudad de México", "Guadalajara", "Monterrey", "Cancún", 
        "Tijuana", "Puebla", "Otras regiones"
    ]
};

// ==========================================
// 🌎 南美洲 (South America)
// ==========================================
const SOUTH_AMERICA = {
    "Brasil": [
        "São Paulo", "Rio de Janeiro", "Brasília", "Salvador", 
        "Fortaleza", "Belo Horizonte", "Curitiba", "Outras regiões"
    ],
    "Argentina": [
        "Buenos Aires", "Córdoba", "Rosario", "Mendoza", 
        "Mar del Plata", "Otras regiones"
    ],
    "Chile": [
        "Santiago", "Valparaíso", "Concepción", "La Serena", "Otras regiones"
    ],
    "Colombia": [
        "Bogotá", "Medellín", "Cali", "Barranquilla", "Cartagena", "Otras regiones"
    ],
    "Perú": [
        "Lima", "Cusco", "Arequipa", "Trujillo", "Otras regiones"
    ],
    "Venezuela": [
        "Caracas", "Maracaibo", "Valencia", "Barquisimeto", "Otras regiones"
    ],
    "Ecuador": [
        "Quito", "Guayaquil", "Cuenca", "Otras regiones"
    ],
    "Uruguay": [
        "Montevideo", "Punta del Este", "Otras regiones"
    ]
};

// ==========================================
// 🌏 大洋洲 (Oceania)
// ==========================================
const OCEANIA = {
    "Australia": [
        "Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", 
        "Gold Coast", "Canberra", "Hobart", "Darwin", "Other regions"
    ],
    "New Zealand": [
        "Auckland", "Wellington", "Christchurch", "Queenstown", "Other regions"
    ],
    "Fiji": [
        "Suva", "Nadi", "Other regions"
    ],
    "Papua New Guinea": [
        "Port Moresby", "Other regions"
    ]
};

// ==========================================
// 🌍 非洲 (Africa)
// ==========================================
const AFRICA = {
    "مصر": [
        "القاهرة", "الإسكندرية", "الجيزة", "شرم الشيخ", "مناطق أخرى"
    ],
    "South Africa": [
        "Johannesburg", "Cape Town", "Durban", "Pretoria", "Other regions"
    ],
    "Nigeria": [
        "Lagos", "Abuja", "Kano", "Ibadan", "Other regions"
    ],
    "Kenya": [
        "Nairobi", "Mombasa", "Kisumu", "Other regions"
    ],
    "المغرب": [
        "الدار البيضاء", "مراكش", "الرباط", "فاس", "مناطق أخرى"
    ],
    "Ghana": [
        "Accra", "Kumasi", "Tamale", "Other regions"
    ],
    "Ethiopia": [
        "Addis Ababa", "Dire Dawa", "Other regions"
    ],
    "Tanzania": [
        "Dar es Salaam", "Zanzibar", "Arusha", "Other regions"
    ]
};

// ==========================================
// 🌐 其他 (Others)
// ==========================================
const OTHERS = {
    "Other Countries": ["Other regions"]
};

// ==========================================
// 📦 合并导出
// ==========================================
export const regionData = {
    // 亚洲（常用国家优先）
    ...ASIA,
    // 欧洲
    ...EUROPE,
    // 北美洲
    ...NORTH_AMERICA,
    // 南美洲
    ...SOUTH_AMERICA,
    // 大洋洲
    ...OCEANIA,
    // 非洲
    ...AFRICA,
    // 其他
    ...OTHERS
};

// 国家列表（按优先级排序：中国、日本、韩国、美国等常用国家优先）
export const PRIORITY_COUNTRIES = [
    "中国", "日本", "대한민국", "United States", "United Kingdom",
    "Deutschland", "France", "Canada", "Australia", "Singapore",
    "Malaysia", "ประเทศไทย", "Việt Nam", "Indonesia", "भारत"
];

// 获取排序后的国家列表
export function getSortedCountries() {
    const allCountries = Object.keys(regionData);
    const prioritized = PRIORITY_COUNTRIES.filter(c => allCountries.includes(c));
    const others = allCountries.filter(c => !PRIORITY_COUNTRIES.includes(c));
    return [...prioritized, ...others];
}
