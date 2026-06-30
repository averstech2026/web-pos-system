/**
 * Справочник из kioskprototype (src/data/catalog.js)
 * https://github.com/averstech2026/kioskprototype
 *
 * Пересобрать после обновления каталога в киоске:
 *   node scripts/build-kiosk-catalog-data.mjs path/to/catalog.js
 */

export const KIOSK_CATALOG = {
  "categories": [
    {
      "slug": "meals",
      "name": "Комплексное питание",
      "imageUrl": "/products/dish-3.png"
    },
    {
      "slug": "drinks",
      "name": "Напитки",
      "imageUrl": "/products/drink-3.png"
    },
    {
      "slug": "breakfast",
      "name": "Завтрак",
      "imageUrl": "/products/icon-breakfast.png"
    },
    {
      "slug": "salads",
      "name": "Салаты и закуски",
      "imageUrl": "/products/salad-3.png"
    },
    {
      "slug": "hot",
      "name": "Горячие блюда",
      "imageUrl": "/products/hot-3.png"
    },
    {
      "slug": "sides",
      "name": "Гарниры",
      "imageUrl": "/products/garnir-3.png"
    },
    {
      "slug": "bread",
      "name": "Хлеб",
      "imageUrl": "/products/bread-3.png"
    },
    {
      "slug": "pastry",
      "name": "Выпечка",
      "imageUrl": "/products/bake-3.png"
    },
    {
      "slug": "fruits",
      "name": "Фрукты",
      "imageUrl": "/products/fruit-3.png"
    },
    {
      "slug": "desserts",
      "name": "Десерты",
      "imageUrl": "/products/dessert-3.png"
    },
    {
      "slug": "toppings",
      "name": "Топинги",
      "imageUrl": "/products/topping-3.png"
    },
    {
      "slug": "disposable",
      "name": "Одноразовая посуда",
      "imageUrl": "/products/disp-3.png"
    }
  ],
  "products": [
    {
      "sku": "lunch1",
      "name": "Бизнес Ланч 1",
      "price": 370,
      "categorySlug": "meals",
      "description": "Суп, второе блюдо, гарнир, напиток",
      "imageUrl": "/products/lunch1.jpg"
    },
    {
      "sku": "lunch2",
      "name": "Бизнес Ланч 2",
      "price": 390,
      "categorySlug": "meals",
      "description": "Салат, горячее, гарнир, хлеб",
      "imageUrl": "/products/lunch2.jpg"
    },
    {
      "sku": "lunch3",
      "name": "Обед офисный",
      "price": 350,
      "categorySlug": "meals",
      "description": "Первое, второе, компот",
      "imageUrl": "/products/lunch3.jpg"
    },
    {
      "sku": "lunch4",
      "name": "Комплексный обед",
      "price": 410,
      "categorySlug": "meals",
      "description": "Суп, салат, горячее, напиток",
      "imageUrl": "/products/lunch4.jpg"
    },
    {
      "sku": "lunch5",
      "name": "Ланч лёгкий",
      "price": 320,
      "categorySlug": "meals",
      "description": "Салат, сэндвич, сок",
      "imageUrl": "/products/lunch5.jpg"
    },
    {
      "sku": "water1",
      "name": "Витаминная вода Апельсин",
      "price": 34,
      "categorySlug": "drinks",
      "description": "",
      "imageUrl": "/products/water1.jpg"
    },
    {
      "sku": "water2",
      "name": "Витаминная вода Имбирь",
      "price": 34,
      "categorySlug": "drinks",
      "description": "",
      "imageUrl": "/products/water2.jpg"
    },
    {
      "sku": "coffee",
      "name": "Кофе растворимый 3в1",
      "price": 67,
      "categorySlug": "drinks",
      "description": "",
      "imageUrl": "/products/coffee.jpg"
    },
    {
      "sku": "tea",
      "name": "Чай чёрный",
      "price": 45,
      "categorySlug": "drinks",
      "description": "",
      "imageUrl": "/products/tea.jpg"
    },
    {
      "sku": "juice",
      "name": "Сок яблочный 0,2 л",
      "price": 55,
      "categorySlug": "drinks",
      "description": "",
      "imageUrl": "/products/juice.jpg"
    },
    {
      "sku": "omelet",
      "name": "Омлет натуральный",
      "price": 120,
      "categorySlug": "breakfast",
      "description": "Яйца, молоко, зелень",
      "imageUrl": "/products/omelet.jpg"
    },
    {
      "sku": "syrniki",
      "name": "Сырники творожные",
      "price": 97,
      "categorySlug": "breakfast",
      "description": "Творог, яйцо, мука, сметана",
      "imageUrl": "/products/syrniki.jpg"
    },
    {
      "sku": "cheese_sandwich",
      "name": "Бутерброд с сыром",
      "price": 87,
      "categorySlug": "breakfast",
      "description": "Хлеб, сыр, масло",
      "imageUrl": "/products/toast.jpg"
    },
    {
      "sku": "ham_sandwich",
      "name": "Сэндвич с ветчиной и сыром",
      "price": 153,
      "categorySlug": "breakfast",
      "description": "Хлеб, ветчина, сыр, соус",
      "imageUrl": "/products/lunch5.jpg"
    },
    {
      "sku": "porridge",
      "name": "Каша овсяная",
      "price": 75,
      "categorySlug": "breakfast",
      "description": "Овсяные хлопья, молоко",
      "imageUrl": "/products/porridge.jpg"
    },
    {
      "sku": "pancakes",
      "name": "Блины с вареньем",
      "price": 110,
      "categorySlug": "breakfast",
      "description": "Блины, варенье, сметана",
      "imageUrl": "/products/pancakes.jpg"
    },
    {
      "sku": "buckwheat_porridge",
      "name": "Каша гречневая",
      "price": 65,
      "categorySlug": "breakfast",
      "description": "Гречка, масло",
      "imageUrl": "/products/buckwheat_porridge.jpg"
    },
    {
      "sku": "caesar",
      "name": "Салат Цезарь",
      "price": 145,
      "categorySlug": "salads",
      "description": "",
      "imageUrl": "/products/caesar.jpg"
    },
    {
      "sku": "veggie_salad",
      "name": "Салат овощной",
      "price": 95,
      "categorySlug": "salads",
      "description": "",
      "imageUrl": "/products/veggie_salad.jpg"
    },
    {
      "sku": "vinaigrette",
      "name": "Винегрет",
      "price": 85,
      "categorySlug": "salads",
      "description": "",
      "imageUrl": "/products/vinaigrette.jpg"
    },
    {
      "sku": "cheese_plate",
      "name": "Сырная тарелка",
      "price": 160,
      "categorySlug": "salads",
      "description": "",
      "imageUrl": "/products/cheese_plate.jpg"
    },
    {
      "sku": "greek_salad",
      "name": "Салат греческий",
      "price": 130,
      "categorySlug": "salads",
      "description": "",
      "imageUrl": "/products/greek_salad.jpg"
    },
    {
      "sku": "chicken_salad",
      "name": "Салат с курицей",
      "price": 140,
      "categorySlug": "salads",
      "description": "",
      "imageUrl": "/products/chicken_salad.jpg"
    },
    {
      "sku": "coleslaw",
      "name": "Салат коул-слоу",
      "price": 90,
      "categorySlug": "salads",
      "description": "",
      "imageUrl": "/products/coleslaw.jpg"
    },
    {
      "sku": "cutlet",
      "name": "Котлета по-домашнему",
      "price": 155,
      "categorySlug": "hot",
      "description": "",
      "imageUrl": "/products/cutlet.jpg"
    },
    {
      "sku": "chicken_grill",
      "name": "Куриное филе гриль",
      "price": 185,
      "categorySlug": "hot",
      "description": "",
      "imageUrl": "/products/chicken_grill.jpg"
    },
    {
      "sku": "goulash",
      "name": "Гуляш говяжий",
      "price": 175,
      "categorySlug": "hot",
      "description": "",
      "imageUrl": "/products/goulash.jpg"
    },
    {
      "sku": "baked_fish",
      "name": "Рыба запечённая",
      "price": 195,
      "categorySlug": "hot",
      "description": "",
      "imageUrl": "/products/baked_fish.jpg"
    },
    {
      "sku": "beef_stew",
      "name": "Плов с говядиной",
      "price": 165,
      "categorySlug": "hot",
      "description": "",
      "imageUrl": "/products/beef_stew.jpg"
    },
    {
      "sku": "meatballs",
      "name": "Тефтели в сметанном соусе",
      "price": 150,
      "categorySlug": "hot",
      "description": "",
      "imageUrl": "/products/meatballs.jpg"
    },
    {
      "sku": "pork_chop",
      "name": "Свиная отбивная",
      "price": 180,
      "categorySlug": "hot",
      "description": "",
      "imageUrl": "/products/pork_chop.jpg"
    },
    {
      "sku": "pasta",
      "name": "Макароны отварные",
      "price": 55,
      "categorySlug": "sides",
      "description": "",
      "imageUrl": "/products/pasta.jpg"
    },
    {
      "sku": "buckwheat",
      "name": "Гречка",
      "price": 50,
      "categorySlug": "sides",
      "description": "",
      "imageUrl": "/products/buckwheat.jpg"
    },
    {
      "sku": "rice",
      "name": "Рис белый",
      "price": 50,
      "categorySlug": "sides",
      "description": "",
      "imageUrl": "/products/rice.jpg"
    },
    {
      "sku": "mashed",
      "name": "Картофельное пюре",
      "price": 60,
      "categorySlug": "sides",
      "description": "",
      "imageUrl": "/products/mashed.jpg"
    },
    {
      "sku": "steamed_veg",
      "name": "Овощи на пару",
      "price": 70,
      "categorySlug": "sides",
      "description": "",
      "imageUrl": "/products/steamed_veg.jpg"
    },
    {
      "sku": "wheat",
      "name": "Хлеб пшеничный",
      "price": 4,
      "categorySlug": "bread",
      "description": "",
      "imageUrl": "/products/wheat.jpg"
    },
    {
      "sku": "rye",
      "name": "Хлеб ржаной",
      "price": 4,
      "categorySlug": "bread",
      "description": "",
      "imageUrl": "/products/rye.jpg"
    },
    {
      "sku": "toast",
      "name": "Хлеб тостовый",
      "price": 10,
      "categorySlug": "bread",
      "description": "",
      "imageUrl": "/products/toast.jpg"
    },
    {
      "sku": "ciabatta",
      "name": "Чиабатта с соусом песто",
      "price": 41,
      "categorySlug": "bread",
      "description": "",
      "imageUrl": "/products/ciabatta.jpg"
    },
    {
      "sku": "baguette",
      "name": "Багет французский",
      "price": 35,
      "categorySlug": "bread",
      "description": "",
      "imageUrl": "/products/baguette.jpg"
    },
    {
      "sku": "bun_sweet",
      "name": "Булочка сдобная",
      "price": 18,
      "categorySlug": "bread",
      "description": "",
      "imageUrl": "/products/bun_sweet.jpg"
    },
    {
      "sku": "lavash",
      "name": "Лаваш армянский",
      "price": 22,
      "categorySlug": "bread",
      "description": "",
      "imageUrl": "/products/lavash.jpg"
    },
    {
      "sku": "croissant",
      "name": "Круассан",
      "price": 65,
      "categorySlug": "pastry",
      "description": "",
      "imageUrl": "/products/croissant.jpg"
    },
    {
      "sku": "cinnamon",
      "name": "Булочка с корицей",
      "price": 55,
      "categorySlug": "pastry",
      "description": "",
      "imageUrl": "/products/cinnamon.jpg"
    },
    {
      "sku": "pirozhok",
      "name": "Пирожок с капустой",
      "price": 45,
      "categorySlug": "pastry",
      "description": "",
      "imageUrl": "/products/pirozhok.jpg"
    },
    {
      "sku": "apple_pastry",
      "name": "Слойка с яблоком",
      "price": 60,
      "categorySlug": "pastry",
      "description": "",
      "imageUrl": "/products/apple_pastry.jpg"
    },
    {
      "sku": "pretzel",
      "name": "Плюшка с маком",
      "price": 48,
      "categorySlug": "pastry",
      "description": "",
      "imageUrl": "/products/pretzel.jpg"
    },
    {
      "sku": "donut",
      "name": "Пончик с глазурью",
      "price": 52,
      "categorySlug": "pastry",
      "description": "",
      "imageUrl": "/products/donut.jpg"
    },
    {
      "sku": "muffin",
      "name": "Маффин шоколадный",
      "price": 58,
      "categorySlug": "pastry",
      "description": "",
      "imageUrl": "/products/muffin.jpg"
    },
    {
      "sku": "apple",
      "name": "Яблоко",
      "price": 25,
      "categorySlug": "fruits",
      "description": "",
      "imageUrl": "/products/apple.jpg"
    },
    {
      "sku": "banana",
      "name": "Банан",
      "price": 30,
      "categorySlug": "fruits",
      "description": "",
      "imageUrl": "/products/banana.jpg"
    },
    {
      "sku": "orange",
      "name": "Апельсин",
      "price": 35,
      "categorySlug": "fruits",
      "description": "",
      "imageUrl": "/products/orange.jpg"
    },
    {
      "sku": "fruit_mix",
      "name": "Фруктовый микс",
      "price": 90,
      "categorySlug": "fruits",
      "description": "",
      "imageUrl": "/products/fruit_mix.jpg"
    },
    {
      "sku": "pineapple",
      "name": "Ананасы нарезка",
      "price": 185,
      "categorySlug": "fruits",
      "description": "",
      "imageUrl": "/products/fruit_mix.jpg"
    },
    {
      "sku": "pear",
      "name": "Груша",
      "price": 28,
      "categorySlug": "fruits",
      "description": "",
      "imageUrl": "/products/pear.jpg"
    },
    {
      "sku": "grapes",
      "name": "Виноград",
      "price": 45,
      "categorySlug": "fruits",
      "description": "",
      "imageUrl": "/products/grapes.jpg"
    },
    {
      "sku": "kiwi",
      "name": "Киви",
      "price": 32,
      "categorySlug": "fruits",
      "description": "",
      "imageUrl": "/products/kiwi.jpg"
    },
    {
      "sku": "cheesecake",
      "name": "Чизкейк",
      "price": 135,
      "categorySlug": "desserts",
      "description": "",
      "imageUrl": "/products/cheesecake.jpg"
    },
    {
      "sku": "tiramisu",
      "name": "Тирамису",
      "price": 145,
      "categorySlug": "desserts",
      "description": "",
      "imageUrl": "/products/tiramisu.jpg"
    },
    {
      "sku": "chia",
      "name": "Десерт кокос. молоко с чиа",
      "price": 125,
      "categorySlug": "desserts",
      "description": "",
      "imageUrl": "/products/chia.jpg"
    },
    {
      "sku": "icecream",
      "name": "Мороженое",
      "price": 80,
      "categorySlug": "desserts",
      "description": "",
      "imageUrl": "/products/icecream.jpg"
    },
    {
      "sku": "brownie",
      "name": "Брауни",
      "price": 95,
      "categorySlug": "desserts",
      "description": "",
      "imageUrl": "/products/brownie.jpg"
    },
    {
      "sku": "eclair",
      "name": "Эклер",
      "price": 75,
      "categorySlug": "desserts",
      "description": "",
      "imageUrl": "/products/eclair.jpg"
    },
    {
      "sku": "honey_cake",
      "name": "Медовик",
      "price": 120,
      "categorySlug": "desserts",
      "description": "",
      "imageUrl": "/products/honey_cake.jpg"
    },
    {
      "sku": "milk",
      "name": "Молоко сгущённое — 30 г",
      "price": 30,
      "categorySlug": "toppings",
      "description": "",
      "imageUrl": "/products/milk.jpg"
    },
    {
      "sku": "tomato_sauce",
      "name": "Соус томатный",
      "price": 25,
      "categorySlug": "toppings",
      "description": "",
      "imageUrl": "/products/tomato_sauce.jpg"
    },
    {
      "sku": "cheese_sauce",
      "name": "Соус сырный",
      "price": 35,
      "categorySlug": "toppings",
      "description": "",
      "imageUrl": "/products/cheese_sauce.jpg"
    },
    {
      "sku": "mayo",
      "name": "Майонез порционный",
      "price": 15,
      "categorySlug": "toppings",
      "description": "",
      "imageUrl": "/products/mayo.jpg"
    },
    {
      "sku": "ketchup",
      "name": "Кетчуп порционный",
      "price": 15,
      "categorySlug": "toppings",
      "description": "",
      "imageUrl": "/products/ketchup.jpg"
    },
    {
      "sku": "mustard",
      "name": "Горчица порционная",
      "price": 12,
      "categorySlug": "toppings",
      "description": "",
      "imageUrl": "/products/mustard.jpg"
    },
    {
      "sku": "pesto",
      "name": "Соус песто — 30 г",
      "price": 40,
      "categorySlug": "toppings",
      "description": "",
      "imageUrl": "/products/pesto.jpg"
    },
    {
      "sku": "container",
      "name": "Контейнер прямоуг. PP чёрный",
      "price": 11,
      "categorySlug": "disposable",
      "description": "",
      "imageUrl": "/products/container.jpg"
    },
    {
      "sku": "cutlery_set",
      "name": "Набор вилка/ложка/нож",
      "price": 8,
      "categorySlug": "disposable",
      "description": "",
      "imageUrl": "/products/cutlery_set.jpg"
    },
    {
      "sku": "cup",
      "name": "Стакан одноразовый",
      "price": 5,
      "categorySlug": "disposable",
      "description": "",
      "imageUrl": "/products/cup.jpg"
    },
    {
      "sku": "napkins",
      "name": "Салфетки",
      "price": 3,
      "categorySlug": "disposable",
      "description": "",
      "imageUrl": "/products/napkins.jpg"
    },
    {
      "sku": "lid",
      "name": "Крышка для контейнера",
      "price": 4,
      "categorySlug": "disposable",
      "description": "",
      "imageUrl": "/products/lid.jpg"
    },
    {
      "sku": "straw",
      "name": "Трубочка одноразовая",
      "price": 2,
      "categorySlug": "disposable",
      "description": "",
      "imageUrl": "/products/straw.jpg"
    },
    {
      "sku": "food_wrap",
      "name": "Плёнка пищевая",
      "price": 6,
      "categorySlug": "disposable",
      "description": "",
      "imageUrl": "/products/food_wrap.jpg"
    }
  ]
};
