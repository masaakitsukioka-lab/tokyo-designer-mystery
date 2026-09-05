"use strict";

// 東京デザイナー・アカデミー殺人事件 / 第1章
// 画像が未配置でも遊べる、テキスト中心のADVエンジンです。

const Game = {
  started: false,
  place: "職員室",
  inventory: [],
  flags: {
    bodyFound: false,
    locationsUnlocked: false,
    cutterSeen: false,
    usbFound: false,
    sekizawaTalk: false,
    houTalk: false,
    houShown: false,
    houChieTalk: false,
    houSelfTalk: false,
    kimuraTestimony: false,
    kimuraReady: false,
    sekizawaShown: false,
    sekizawaCutterShown: false,
    sekizawaUsbShown: false,
    sekizawaChieTalk: false,
    sekizawaHouTalk: false,
    cutterFound: false,
    gateTalk: false,
    bookshelfChecked: false,
    tanakaBookshelfChecked: false,
    usbRead: false,
    kimuraUnlocked: false
  }
};

const Places = {
  "西神田校舎正門": { image: "images/gate.png", people: ["通行人"], items: ["玄関", "階段", "看板", "裏口"] },
  "職員室": { image: "images/staffroom.png", people: [], items: ["智恵蔵の机", "智恵蔵のPC"] },
  "801教室": { image: "images/801.png", people: ["関澤遼"], items: ["作業机", "ゴミ箱", "本棚"] },
  "901シルク室": { image: "images/silk.png", people: ["侯宇帆"], items: ["教室", "机のうえ"] },
  "904教室": { image: "images/904.png", people: [], items: ["智恵蔵", "ゆか"] },
  "学生ホール": { image: "images/hall.png", people: [], items: ["学生ホール"] }
};

const message = () => document.getElementById("message");
const locationLabel = () => document.getElementById("location");
const visual = () => document.getElementById("image");
const sceneImage = () => document.getElementById("sceneImage");
const characterSprite = () => document.getElementById("characterSprite");

let typing = false;
let timer = null;
let next = null;
let typingComplete = null;
let sekizawaTalkTimer = null;
let sekizawaMouthOpen = false;
let commandMenuOpen = false;

// 音声ファイルなしで鳴らす、矩形波のチップチューンBGM。
let audioContext = null;
let bgmTimer = null;
let bgmStep = 0;
let nextNoteTime = 0;
let currentTrack = null;
let bgmEnabled = false;
const activeOscillators = new Set();

const NOTE = {
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0,
  B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0
};

const BGM = {
  title: {
    beat: 0.22,
    melody: ["D5", null, "A4", "D5", "F4", null, "E4", null, "D5", null, "C5", "A4", "G4", null, "A4", null],
    bass: ["D3", null, null, null, "C3", null, null, null, "F3", null, null, null, "A3", null, "A3", null]
  },
  game: {
    beat: 0.17,
    melody: ["D5", null, "A4", "F4", "E4", null, "D4", null, "D5", null, "C5", "A4", "G4", "F4", "E4", null],
    bass: ["D3", null, "D3", null, "C3", null, "C3", null, "F3", null, "F3", null, "A3", null, "A3", null]
  },
  scene904: {
    beat: 0.105,
    melody: ["D5", "C5", null, "D5", "A4", null, "G4", "F4", "D5", null, "C5", "A4", "E4", null, "D4", null],
    bass: ["D3", "D3", null, "C3", "D3", null, "A3", null, "D3", "D3", null, "C3", "F3", null, "E3", null]
  }
};

function enableAudio() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();
  }
  return audioContext.resume();
}

function playNote(note, duration, volume, when) {
  if (!note || !audioContext) return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(NOTE[note], when);
  gain.gain.setValueAtTime(volume, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + duration * 0.9);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  activeOscillators.add(oscillator);
  oscillator.addEventListener("ended", () => activeOscillators.delete(oscillator));
  oscillator.start(when);
  oscillator.stop(when + duration);
}

function scheduleBgmNotes() {
  const track = BGM[currentTrack];
  if (!track || !audioContext) return;
  while (nextNoteTime < audioContext.currentTime + 0.2) {
    const index = bgmStep % track.melody.length;
    playNote(track.melody[index], track.beat, 0.04, nextNoteTime);
    playNote(track.bass[index], track.beat * 1.7, 0.03, nextNoteTime);
    bgmStep += 1;
    nextNoteTime += track.beat;
  }
}

function stopBgm() {
  if (bgmTimer) clearInterval(bgmTimer);
  bgmTimer = null;
  activeOscillators.forEach((oscillator) => {
    try { oscillator.stop(); } catch (_) { /* already stopped */ }
  });
  activeOscillators.clear();
}

async function startBgm(trackName) {
  if (!bgmEnabled) return;
  await enableAudio();
  if (currentTrack === trackName && bgmTimer) return;
  stopBgm();
  currentTrack = trackName;
  bgmStep = 0;
  nextNoteTime = audioContext.currentTime + 0.05;
  scheduleBgmNotes();
  bgmTimer = setInterval(scheduleBgmNotes, 50);
}

function updateBgmButton() {
  const button = document.querySelector(".bgmToggle");
  if (button) button.textContent = bgmEnabled ? "♪ BGM: ON" : "♪ BGM: OFF";
}

function clearTyping() {
  if (timer) clearInterval(timer);
  timer = null;
  typing = false;
}

function typeText(text, callback, onComplete) {
  clearTyping();
  const box = message();
  box.textContent = "";
  next = callback || null;
  typingComplete = onComplete || null;
  let index = 0;
  typing = true;
  timer = setInterval(() => {
    box.textContent += text[index] || "";
    index += 1;
    if (index >= text.length) {
      clearTyping();
      if (next) box.textContent += "\n\n▼ クリックで進む";
      const complete = typingComplete;
      typingComplete = null;
      if (complete) complete();
    }
  }, 18);
}

function showText(text, callback, onComplete) {
  renderCommandList();
  typeText(text, callback, onComplete);
}

function updatePlace() {
  locationLabel().textContent = `場所：${Game.place}`;
  const place = Places[Game.place];
  visual().textContent = `▣ ${Game.place}\n画像準備中`;
  const img = sceneImage();
  img.alt = `${Game.place}の背景`;
  img.src = place.image;
  img.onerror = () => { img.style.display = "none"; };
  img.onload = () => { img.style.display = "block"; visual().textContent = ""; };
  updateCharacterSprite();
}

function updateCharacterSprite() {
  const sprite = characterSprite();
  stopSekizawaTalking();
  if (Game.place !== "801教室") {
    sprite.style.display = "none";
    sprite.removeAttribute("src");
    return;
  }
  sprite.src = "images/sekizawa_01.png";
  sprite.alt = "801教室にいる関澤遼";
  sprite.style.display = "block";
}

function startSekizawaTalking() {
  if (Game.place !== "801教室") return;
  stopSekizawaTalking();
  const sprite = characterSprite();
  sekizawaMouthOpen = true;
  sprite.src = "images/sekizawa_02.png";
  sekizawaTalkTimer = setInterval(() => {
    sekizawaMouthOpen = !sekizawaMouthOpen;
    sprite.src = sekizawaMouthOpen ? "images/sekizawa_02.png" : "images/sekizawa_01.png";
  }, 1000);
}

function stopSekizawaTalking() {
  if (sekizawaTalkTimer) clearInterval(sekizawaTalkTimer);
  sekizawaTalkTimer = null;
  sekizawaMouthOpen = false;
  if (Game.place === "801教室") characterSprite().src = "images/sekizawa_01.png";
}

function commands() {
  return document.querySelector(".commands");
}

function runCommand(action) {
  if (!Game.started) return;
  if (!Game.flags.bodyFound && action !== moveMenu) {
    showText("今は904教室へ向かわなくては。\n\n「ばしょいどう」を選ぼう。");
    return;
  }
  action();
}

function renderCommandList() {
  const box = commands();
  if (!box || !Game.started) return;
  commandMenuOpen = false;
  box.replaceChildren();
  const commandList = [
    ["ばしょいどう", moveMenu],
    ["きく", talkMenu],
    ["しらべる", searchMenu],
    ["みせる", showMenu],
    ["とる", takeMenu],
    ["さがす", findMenu]
  ];
  if (Game.flags.kimuraTestimony && Game.flags.cutterFound) commandList.push(["こくはつする", accuse]);
  commandList.forEach(([label, action]) => {
    const button = document.createElement("button");
    button.className = "command";
    button.type = "button";
    button.textContent = `▶ ${label}`;
    button.addEventListener("click", () => runCommand(action));
    box.appendChild(button);
  });
}

function showChoices(title, choices) {
  clearTyping();
  next = null;
  commandMenuOpen = true;
  const box = commands();
  box.replaceChildren();
  const heading = document.createElement("div");
  heading.className = "commandMenuTitle";
  heading.textContent = title;
  box.appendChild(heading);
  choices.forEach(({ label, action, disabled }) => {
    const button = document.createElement("button");
    button.className = "choice commandChoice";
    button.type = "button";
    button.textContent = `▶ ${label}`;
    button.disabled = Boolean(disabled);
    button.addEventListener("click", action);
    box.appendChild(button);
  });
  const back = document.createElement("button");
  back.className = "choice commandChoice commandBack";
  back.type = "button";
  back.textContent = "▶ もどる";
  back.addEventListener("click", () => {
    renderCommandList();
    message().textContent = "コマンドを選択してください。";
  });
  box.appendChild(back);
}

function moveMenu() {
  const destinations = Game.flags.locationsUnlocked ? Object.keys(Places) : ["904教室"];
  const choices = destinations.filter((place) => place !== Game.place);
  if (!choices.length) return showText("現場を離れる前にやるべきことがある");
  showChoices("移動先を選んでください。", choices
    .map((place) => ({ label: place, action: () => movePlace(place) })));
}

function movePlace(place) {
  Game.place = place;
  updatePlace();
  startBgm(place === "904教室" ? "scene904" : "game");
  if (place === "904教室" && !Game.flags.bodyFound) {
    Game.flags.bodyFound = true;
    showText("床には智恵蔵が倒れている。\n月岡「なんてことだっ！智恵蔵がっ！」\n体は血に染まりその顔は明らかに命を宿していなかった。\n月岡「智恵蔵が……殺された……」\nまずは現場を調べよう。");
    return;
  }
  const entrances = {
    "901シルク室": "侯宇帆がいる。\nどうする？",
    "801教室": Game.flags.usbRead ? "関澤がいる。\n問い詰めよう" : Game.flags.kimuraTestimony ? "関澤がいる。\n問い詰めよう" : "関澤がいる。\nどうする？",
    "西神田校舎正門": "西神田校舎の正面玄関だ。すっかり暗くなっている。\n玄関前に通行人がいる。話を聞いてみよう。",
    "学生ホール": Game.flags.kimuraUnlocked ? "木村を見つけた！ひどく怯えている様子だ。" : "誰もいない。",
    "職員室": "職員室には誰もいない"
  };
  showText(entrances[place] || "");
}

function talkMenu() {
  const people = Game.place === "学生ホール" && Game.flags.kimuraUnlocked ? ["木村友紀子"] : Places[Game.place].people;
  if (!people.length) return showText("いま話を聞ける人物はいない。");
  if (Game.place === "職員室") return showText("ここには誰もいない");
  const topics = ["智恵蔵のこと", "侯宇帆のこと", "関澤のこと", "木村のこと", "気づいたこと"];
  showChoices("誰に何を聞きますか？", people.flatMap((person) => topics.map((topic) => ({
    label: `${person}：${topic}`,
    action: () => talkPerson(person, topic)
  }))));
}

function talkPerson(person, topic) {
  if (person === "関澤遼") {
    Game.flags.sekizawaTalk = true;
    startSekizawaTalking();
    if (Game.flags.kimuraTestimony) {
      const afterTestimony = {
        "智恵蔵のこと": "関澤「僕は何も知りません」",
        "侯宇帆のこと": "僕は何も知りません",
        "関澤のこと": "関澤「ぼくはずっとここにいました」",
        "木村のこと": "関澤「木村さん、いたんですか？」",
        "気づいたこと": "関澤「…………………………」"
      };
      showText(afterTestimony[topic] === "僕は何も知りません" ? "関澤「僕は何も知りません」" : afterTestimony[topic], null, stopSekizawaTalking);
      return;
    }
    let line;
    if (topic === "智恵蔵のこと") {
      line = Game.flags.sekizawaChieTalk ? "……………………" : "月岡「智恵蔵が死んでるのを見つけた」\n関澤「？え！！？亡くなった！！？」";
      Game.flags.sekizawaChieTalk = true;
    } else if (topic === "侯宇帆のこと") {
      line = Game.flags.sekizawaHouTalk ? "関澤「シルク室にいると思いますが……」" : "関澤「侯先生は901で作業をされていました……」";
      Game.flags.sekizawaHouTalk = true;
    } else if (topic === "関澤のこと") line = "関澤「ぼくは801でずっと卒制の準備をしていました…。智恵先生には会っていません」";
    else if (topic === "木村のこと") line = "関澤「木村さん、しばらく見かけてないんですよね……いるはずなんですが。\n関澤「月岡先生、木村さんどこにいるかご存知ないですか？」";
    else line = "いえ、特には……";
    showText(line, null, stopSekizawaTalking);
    checkKimura();
    return;
  }
  if (person === "侯宇帆") {
    Game.flags.houTalk = true;
    const lines = {
      "智恵蔵のこと": Game.flags.houChieTalk ? "「そんな、智恵さんが……」" : "侯くん「智恵さんがどうしたの？え！！？死んでる！？？」\n月岡「智恵蔵が死んでるのを見つけたんだ」",
      "侯宇帆のこと": Game.flags.houSelfTalk ? "「なんで何度も聞くの、ぼくのこと疑ってるの？」" : "ぼく？ぼくはここでシルクの授業準備をしていたよ",
      "関澤のこと": "関澤？ 801で残業してたと思うけど。",
      "木村のこと": "木村？ どこにいるかわからないよ。帰ってないと思うけど……",
      "気づいたこと": "そういえば智恵さん最近、関澤のことをずっと『カメムシ』って呼んでた。"
    };
    if (topic === "智恵蔵のこと") Game.flags.houChieTalk = true;
    if (topic === "侯宇帆のこと") Game.flags.houSelfTalk = true;
    showText(lines[topic]);
    checkKimura();
    return;
  }
  if (person === "通行人") {
    if (topic === "気づいたこと") Game.flags.gateTalk = true;
    const lines = { "智恵蔵のこと":"通行人「え？誰それ？」", "侯宇帆のこと":"通行人「しらんなあ」", "関澤のこと":"通行人「俺は滝澤だけど」", "木村のこと":"通行人「誰だかわからんなあ」", "気づいたこと":"通行人「しばらくここにおったけど誰も見かけてないよ。建物に入った人も出た人もいなかったなあ」\n外部犯の可能性はなさそうだ……" };
    showText(lines[topic]);
    checkKimura();
    return;
  }
  if (topic === "智恵蔵のこと") {
    if (!Game.flags.kimuraReady) {
      Game.flags.kimuraReady = true;
      return showText("月岡「智恵蔵が死んだんだ」\n木村「！！！…………………………」");
    }
    return showText("月岡「何か、見たのか？」\n木村「智恵先生、ずっと何か調べてました……」\n月岡「何を調べていた？」\n木村「そこまでは……でも誰かを疑っているようでした」");
  }
  if (topic === "関澤のこと" && Game.flags.kimuraReady) {
    Game.flags.kimuraTestimony = true;
    showText("木村「関澤くん、さっき智恵先生と一緒にいたんです」\n月岡「どういうことだ？」\n木村「智恵先生が関澤くんを904に呼び出していて……」\n木村「心配でこっそりついて行ったんです。関澤くん、また何かやらかしたのかと思って……そこでふたりが言い争っているのを聞いてしまって」\n木村「目があったんです……関澤くんと、すごい怖い顔してて……それで怖くて逃げてしまいました」\n月岡「そういうことだったのか……」\n関澤を追求しなくては！");
  } else if (topic === "木村のこと") {
    showText("月岡「どこに行ってたんだ？心配したんだぞ」\n木村「…………………………」");
  } else {
    showText("木村「…………………………」");
  }
  updateAccuseCommand();
}

function searchMenu() {
  if (Game.place === "801教室" && Game.flags.kimuraTestimony) {
    return showText("今は関澤を追求しよう。");
  }
  const items = [...Places[Game.place].items].filter((item) => item !== "智恵蔵のPC" || hasItem("赤いUSBメモリ"));
  if (Game.place === "904教室" && Game.flags.cutterSeen) items.push("血染めのカッター");
  if (Game.place === "801教室" && Game.flags.bookshelfChecked) items.push("智恵蔵の本棚");
  showChoices("何を調べますか？", items.map((item) => ({ label: item, action: () => searchItem(item) })));
}

function searchItem(item) {
  const key = `${Game.place}:${item}`;
  if (key === "904教室:智恵蔵") return showText("明らかに殺害されている。鋭い刃物による深い傷が見える。これは事故ではない。\n犯人は智恵蔵と向き合い、言い争いの末に刺したのだろう。");
  if (key === "904教室:ゆか") {
    Game.flags.cutterSeen = true;
    return showText("床には血に染まったカッターが落ちている。\n月岡「おそらくこれが凶器だろう」");
  }
  if (key === "904教室:血染めのカッター") return showText("血の付いたカッターが落ちている。犯人は智恵蔵と向き合っていた。\nどうやら突然の襲撃ではなさそうだ。\nカッターは801教室で使われているものと同じ型だ。\n「とる」で凶器を確保しよう。");
  if (key === "801教室:本棚") {
    Game.flags.bookshelfChecked = true;
    return showText("801教室には図書室も兼ねてたくさんのデザイン系書籍がある。\n一部、職員の本も置かれている。");
  }
  if (key === "801教室:智恵蔵の本棚") {
    Game.flags.tanakaBookshelfChecked = true;
    return showText("智恵蔵の私物の本だ。たくさんのマンガが並んでいる。\n？？？奥に、何か赤いものが押し込められている。\n「とる」で何か確認しよう。");
  }
  if (key === "801教室:ゴミ箱") return showText("ん？ゴミ箱に小さく破れた伝票の切れ端がある。\n関澤に聞いても知らないという。");
  if (key === "職員室:智恵蔵の机") return showText("特に気になるものはないが……");
  if (key === "職員室:智恵蔵のPC") {
    return readUsb();
  }
  const descriptions = {
    "901シルク室:教室": "教室の中にはたくさんの学生作品が貼られている。授業で学生が印刷したものらしい。",
    "901シルク室:机のうえ": "机の上にはシルクの用具がたくさん置かれている。明日の授業準備をしていたのは本当のようだ。",
    "801教室:作業机": "卒制関連の資料が並んでいる。関澤が仕事をしていたようだ。",
    "西神田校舎正門:玄関": "学生もいないので正面玄関は鍵が閉められている。",
    "西神田校舎正門:階段": "2階入り口につながる階段だ。一階が施錠された後はここから出入りする。",
    "西神田校舎正門:看板": "東京デザイナー・アカデミーと書かれている。",
    "西神田校舎正門:裏口": "念のため裏口も調べたが、施錠されている。外部から入ることはできない。",
    "学生ホール:学生ホール": Game.flags.kimuraUnlocked ? "目の前で木村がひどく怯えている" : "ここには誰もいない……"
  };
  showText(descriptions[key] || `${item}を調べた。`);
}

function takeMenu() {
  if (Game.place === "904教室" && Game.flags.cutterSeen && !Game.flags.cutterFound) {
    Game.flags.cutterFound = true;
    Game.flags.locationsUnlocked = true;
    Game.inventory.push("血の付いたカッター");
    updateAccuseCommand();
    return showText("血の付いたカッターを、凶器として確保した。");
  }
  if (Game.place === "801教室" && Game.flags.tanakaBookshelfChecked && !Game.flags.usbFound) {
    Game.flags.usbFound = true;
    Game.inventory.push("赤いUSBメモリ");
    checkKimura();
    return showText("本棚のマンガをどけると、奥から赤いUSBメモリが出てきた。\n赤いUSBメモリをとった。");
  }
  showText(Game.place === "学生ホール" ? "ここにはとるものはない……" : Game.place === "西神田校舎正門" ? "ここにはとるものがない" : Game.place === "901シルク室" ? "ここにとれそうなものはない" : "ここにとるものはない");
}

function showMenu() {
  const people = Game.place === "学生ホール" && Game.flags.kimuraUnlocked ? ["木村友紀子"] : Places[Game.place].people;
  if (!people.length) return showText(Game.place === "学生ホール" ? "ここにはみせる相手がいない……" : "みせる相手がいない。");
  if (!Game.inventory.length) return showText("みせる相手がいない。");
  showChoices("何を見せますか？", people.flatMap((person) => Game.inventory.map((item) => ({
    label: `${person}：${item}`,
    action: () => showItem(person, item)
  }))));
}

function showItem(person, item) {
  if (person === "侯宇帆" && item === "血の付いたカッター") {
    Game.flags.houShown = true;
    checkKimura();
    return showText("侯くん「血がついてる！……そのカッター801で使ってるやつだよね」");
  }
  if (person === "侯宇帆" && item === "赤いUSBメモリ") {
    return showText("侯くん「見覚えないなあ」");
  }
  if (person === "関澤遼") {
    Game.flags.sekizawaShown = true;
    checkKimura();
    startSekizawaTalking();
    if (Game.flags.kimuraTestimony) {
      return showText("関澤「僕は何も知りません」", null, stopSekizawaTalking);
    }
    if (item === "赤いUSBメモリ") {
      const line = Game.flags.sekizawaUsbShown ? "関澤「……………………………」" : "関澤「それ！……なんですかね」";
      Game.flags.sekizawaUsbShown = true;
      return showText(line, null, stopSekizawaTalking);
    }
    const line = Game.flags.sekizawaCutterShown ? "すみません、みたくないです。血が苦手なので……" : "関澤「それって……凶器ですか……？」";
    Game.flags.sekizawaCutterShown = true;
    return showText(line, null, stopSekizawaTalking);
  }
  if (person === "木村友紀子") return showText(item === "赤いUSBメモリ" ? "木村「それ、智恵先生のUSBです」" : "木村「！！！それは……」");
  showText("通行人「ん？なんですか？それ？」");
}

function hasItem(name) {
  return Game.inventory.includes(name);
}

function findMenu() {
  if (Game.place === "801教室" && Game.flags.kimuraTestimony) return showText("今は関澤を追求しよう。");
  const targets = ["智恵蔵", "侯くん", "関澤", "木村", "犯人"];
  showChoices("誰を探しますか？", targets.map((target) => ({
    label: target,
    action: () => findTarget(target)
  })));
}

function findTarget(target) {
  const place = Game.place;
  const locations = {
    "田中先生": "904で殺されている。",
    "侯くん": place === "901シルク室" ? "目の前にいる。田中先生のことを聞いて不安そうだ。" : "シルク室にいる。",
    "関澤": place === "801教室" ? "目の前にいる。田中先生が死んだからか、どこかそわそわしている。" : "801教室にいる。",
    "木村": Game.flags.kimuraUnlocked && place === "学生ホール" ? "ひとまず無事のようだが、ひどく怯えている。" : "しばらく木村を見ていない。帰ってはいないはずだが……",
    "犯人": "怪しい人物は、まだ特定できない。"
  };
  showText(locations[target]);
}

function readUsb() {
  const password = window.prompt("パスワード4桁の入力画面が出現。");
  if (password === null) return;
  if (password !== "カメムシ") {
    showText("エラー", () => readUsb());
    return;
  }
  Game.flags.usbRead = true;
  showText("赤いUSBを接続した。\nパスワード？\n月岡「これは……」\nそこには学科の予算書の帳簿が入っていた。\n過去3年分の発注書や請求書のデータが格納されている。\n月岡「どういうことだ？」\nそこに記載された金額には明かな違和感があった。\n月岡「金額が明らかに水増しされている…これは裏帳簿、発注担当者の名前は全て関澤だ！」\n関澤の過去3年に及ぶ横領の証拠を見つけた！\n月岡「動機はこれに違いない！」\n関澤をこくはつしよう。");
  updateAccuseCommand();
}

function checkKimura() {
  const f = Game.flags;
  if (!f.kimuraUnlocked && f.houTalk && f.houShown && f.sekizawaTalk && f.bookshelfChecked && f.usbFound && f.sekizawaShown && f.gateTalk) {
    f.kimuraUnlocked = true;
  }
}

function updateAccuseCommand() {
  if (!commandMenuOpen) renderCommandList();
}

function accuse() {
  if (Game.place !== "801教室") return showText("関澤をこくはつしよう");
  if (!Game.flags.usbRead) return showText("こくはつするにはまだ証拠がない。職員室で証拠を調べよう");
  startSekizawaTalking();
  showText("月岡「お前が智恵蔵を殺したんだなっ」\n月岡「証拠は見つけた。この横領の裏帳簿、これが動機だあっ」\n関澤「……」\n関澤は諦めた様子で語り出した。\n関澤「……801教室でハレパネを切る作業をしていた時に智恵先生に呼び出されました」\n関澤「その時カッターを持ったまま904教室に行ったんです」\n関澤「殺すつもりはなかったんです……」\n関澤「……智恵先生に裏帳簿のことがバレて」\n関澤「もう訳がわからなくて、気がついたら……」\n関澤「智恵先生が目の前で倒れていました……」\n月岡「お前、その後801にいたのはこれを探していたからだな？」\n赤いUSBを関澤に突きつけた\n月岡「智恵蔵を殺したあげくに横領の証拠を隠滅しようとしていたんだっ」\n月岡「お前は救いのないことをした……この馬鹿野郎がっ！」\n関澤はもうしゃべることなくただうなだれてれていた。\n遠くからパトカーのサイレンが聞こえる。\nこうして、一夜の事件は関澤の逮捕によって幕を閉じた", showCredits, stopSekizawaTalking);
}

function showCredits() {
  stopBgm();
  document.getElementById("screen").innerHTML = `<div class="credits"><p>東京デザイナー・アカデミー殺人事件</p><p>出演</p><p>月岡正明<br>田中智恵<br>侯宇帆<br>関澤遼<br>木村友紀子</p><p>ディレクター<br>月岡正明</p><p>シナリオ<br>月岡正明</p><p>プログラム<br>Chat GPT</p><p>THE END</p></div>`;
}

function startGame() {
  if (Game.started) return;
  Game.started = true;
  document.getElementById("title").style.display = "none";
  document.getElementById("screen").style.display = "block";
  updatePlace();
  startBgm("game");
  showText("2026年冬。東京デザイナー・アカデミー。\n卒業制作の搬入まで、あと一週間。\n深夜の職員室で、学科長の月岡正明は一人、提出データを確認していた。\n月岡「みんないないな、どこ行ったんだろ…」\nグラフィックデザイン学科には5名スタッフがいるが、全員残業の真っ最中だった。", () => {
    showText("――智恵蔵の携帯から、電話が鳴った。\n智恵蔵『904教室に……きて……』声は非常に掠れていたが聞き覚えのある智恵蔵の声だった。途切れた声を最後に、通話は切れた。\n月岡「904教室に行ってみなくてはっ！」");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const title = document.getElementById("title");
  const startButton = document.querySelector(".start");
  const bgmButton = document.querySelector(".bgmToggle");
  startButton.addEventListener("click", () => {
    bgmEnabled = true;
    startGame();
  });
  bgmButton.addEventListener("click", () => {
    bgmEnabled = !bgmEnabled;
    updateBgmButton();
    if (bgmEnabled) startBgm(Game.started ? "game" : "title");
    else stopBgm();
  });
  title.addEventListener("click", (event) => {
    if (event.target === title) {
      bgmEnabled = true;
      updateBgmButton();
      startBgm("title");
    }
  });
  updateBgmButton();
  renderCommandList();
  message().addEventListener("click", () => {
    if (typing) return;
    if (next) {
      const callback = next;
      next = null;
      callback();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (!Game.started) return;
    if (event.key === " " || event.key === "Enter") {
      if (typing) return;
      if (next) {
        event.preventDefault();
        const callback = next;
        next = null;
        callback();
      }
    }
  });
});
