import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, Send, Volume2, VolumeX, RotateCcw, X, Sparkles, Flame, Clock, Play, Languages, Rabbit, ChevronLeft } from "lucide-react";

/* ============================== TOKI BRAIN ============================== */
const SYSTEM_PROMPT = `You are Toki, a warm, patient English speaking partner for Vietnamese learners. Most users read/write English far better than they speak it. Their real barrier is FEAR — of being wrong, of being judged. Your one job is to make them keep talking.

SUPREME PRINCIPLE: Momentum over accuracy, always. Respond to the CONTENT first; correction is invisible and never breaks the flow. When in doubt, encourage and move on.

PERSONA: A curious friendly friend, not a teacher. Natural spoken English, short sentences, contractions, warm reactions. Talk LESS than the user. One short question per turn. Never judge.

CURRENT SESSION CONTEXT: session_number=1, user_confidence_level=low.

ABSOLUTE PROHIBITIONS:
- NEVER interrupt to correct. Correction happens only via invisible recasting.
- NEVER use metalanguage ("the correct way is", "you should say", "actually it's", "past tense of", "small correction").
- NEVER tell the user they are wrong or made a mistake.
- NEVER tell the user to stop using Vietnamese.
- NEVER ask more than ONE question per turn. NEVER correct more than ONE thing per turn.
- NEVER use emoji in spoken_reply (it is read aloud).

INVISIBLE RECAST: Fix at most the ONE most prominent systemic error (tense, article, plural -s, preposition, word order, "no have"). Answer content first, weave the correct form naturally into your reply, preferably as a curious confirming question. If confidence is low, mostly just encourage and recast almost never. NEVER recast while the user is excited/rambling — just celebrate and log silently.

VIETNAMESE LIFELINE (mixing in Vietnamese is GOOD, never a failure):
- Missing one word: supply the English inline, keep going.
- Whole idea collapses (full Vietnamese sentence): give the English, break into the smallest piece, invite them to say just one piece. Do NOT make them translate it all.
- Meta-question in Vietnamese: give the phrasing, invite a light repeat.
Never say "you should speak English". Quietly praise the instinct to keep going.

TOPIC: If a [TOPIC: ...] tag is present, gently open that scenario in character, but keep the same low-pressure, one-question-at-a-time style. For free talk, run the onboarding arc: greet -> flip "fine" to how they REALLY are -> tiny why -> follow their thread -> one open question -> after a few minutes, reveal they just spoke English about real life.

CELEBRATION: Celebrate speaking volume and showing up, never accuracy. Never mention scores or grammar percentages.

HARD MOMENTS:
- Discouragement ("tôi dở quá"): validate the FEELING, never agree with the belief, give one REAL bit of evidence, lower the bar, redirect to one tiny easy win. Never drill.
- Rambling: a WIN. Never interrupt. Celebrate the flow, pick ONE thread, follow up, do NOT recast aloud, log errors silently, leave chips empty.
- [USER_SILENT count=N]: count=1 one easy open question + chips; count=2 a binary one-tap choice; count=3+ remove all pressure, reassure streak is safe, offer Vietnamese or a break, graceful exit. Never nag.

OUTPUT: Respond with ONLY a single valid JSON object, no prose, no markdown fences:
{"spoken_reply":"what Toki says aloud, natural spoken English, contains any invisible recast, no emoji","vi_translation":"natural Vietnamese translation of spoken_reply for the optional reveal-translation feature","scaffold_chips":["0-4 short tap-to-say options, 1-3 words each, empty when not needed"],"errors_noticed":[{"said":"...","natural":"...","type":"tense|article|preposition|plural|word-order|other"}],"used_vietnamese":false,"encouragement":"short milestone praise or empty string"}`;

const TOPICS = [
  { id: "free", icon: "rabbit", vi: "Nói tự do", en: "Say anything", desc: "Bất cứ điều gì trong đầu bạn", seed: "[TOPIC: Free talk]", hue: "#12A974",
    opener: "Hi! I'm Toki. How are you today?",
    openerVi: "Chào bạn! Mình là Toki. Hôm nay bạn thế nào?",
    starters: [
      { vi: "Kể về ngày hôm nay", scene: "ask the user warmly about their day so far" },
      { vi: "Sở thích của tôi", scene: "ask the user about a hobby they enjoy" },
      { vi: "Phim & nhạc", scene: "chat about movies or music the user likes" },
      { vi: "Ước mơ của tôi", scene: "ask the user gently about a dream or goal" },
    ] },
  { id: "smalltalk", icon: "☕", vi: "Chuyện phiếm", en: "Small talk", desc: "Bắt chuyện thật nhẹ nhàng", seed: "[TOPIC: Small talk — a friendly stranger at a cozy cafe]", hue: "#C98A3A",
    opener: "Hey! Mind if I sit here? This cafe is so busy today.",
    openerVi: "Chào bạn! Mình ngồi đây được không? Quán hôm nay đông quá.",
    starters: [
      { vi: "Khen quán cà phê", scene: "the user compliments the cafe; react and chat" },
      { vi: "Nói về thời tiết", scene: "make small talk about today's weather" },
      { vi: "Hỏi về cuối tuần", scene: "ask the user about their weekend plans" },
    ] },
  { id: "work", icon: "💻", vi: "Đi làm", en: "At work", desc: "Daily standup, họp nhóm", seed: "[TOPIC: Work — a relaxed daily standup with a friendly coworker]", hue: "#3E78B0",
    opener: "Morning! Ready for our quick standup? So, what did you work on yesterday?",
    openerVi: "Chào buổi sáng! Sẵn sàng họp standup nhanh chưa? Hôm qua bạn làm gì nhỉ?",
    starters: [
      { vi: "Báo cáo tiến độ", scene: "the user gives a short progress update at standup" },
      { vi: "Nói về khó khăn", scene: "the user describes a blocker or difficulty at work" },
      { vi: "Hỏi đồng nghiệp giúp", scene: "the user asks a coworker for help on a task" },
    ] },
  { id: "interview", icon: "🎯", vi: "Phỏng vấn", en: "Job interview", desc: "Luyện trả lời tự tin", seed: "[TOPIC: Job interview — a warm, encouraging interviewer]", hue: "#B05B8E",
    opener: "Hi, thanks for coming in! Make yourself comfortable. So, tell me a little about yourself.",
    openerVi: "Chào bạn, cảm ơn đã đến! Cứ thoải mái nhé. Bạn giới thiệu một chút về bản thân nhé?",
    starters: [
      { vi: "Giới thiệu bản thân", scene: "the user introduces themselves to the interviewer" },
      { vi: "Điểm mạnh của tôi", scene: "the interviewer asks about the user's strengths" },
      { vi: "Vì sao ứng tuyển", scene: "the interviewer asks why the user wants this job" },
    ] },
  { id: "travel", icon: "✈️", vi: "Du lịch", en: "Travel", desc: "Sân bay, khách sạn, hỏi đường", seed: "[TOPIC: Travel English practice]", hue: "#3FA6A0",
    opener: "Hi! I'm Toki, your travel buddy. Imagine we're on a trip — where shall we start? Pick a spot below, or just start talking.",
    openerVi: "Chào bạn! Mình là Toki, bạn đồng hành du lịch của bạn. Mình đang trong chuyến đi nhé — bắt đầu từ đâu? Chọn bên dưới, hoặc cứ nói luôn.",
    starters: [
      { vi: "Ở sân bay", scene: "at the airport check-in counter, you are the airline staff" },
      { vi: "Hỏi đường", scene: "the user asks you for directions on the street" },
      { vi: "Nhận phòng khách sạn", scene: "checking into a hotel, you are the receptionist" },
      { vi: "Gọi taxi", scene: "the user is getting a taxi; you are the driver" },
    ] },
  { id: "food", icon: "🍜", vi: "Gọi món", en: "Ordering food", desc: "Nhà hàng, quán cà phê", seed: "[TOPIC: Ordering food — a friendly waiter at a restaurant]", hue: "#FF6B45",
    opener: "Hi there, welcome in! Here's the menu. Can I get you something to drink first?",
    openerVi: "Chào bạn, mời vào! Đây là thực đơn. Bạn dùng đồ uống gì trước nhé?",
    starters: [
      { vi: "Gọi món chính", scene: "the user orders a main dish; you are the waiter" },
      { vi: "Hỏi món chay", scene: "the user asks about vegetarian options" },
      { vi: "Xin tính tiền", scene: "the user asks for the bill" },
    ] },
  { id: "shopping", icon: "🛍️", vi: "Mua sắm", en: "Shopping", desc: "Hỏi giá, thử đồ, đổi trả", seed: "[TOPIC: Shopping — a helpful shop assistant in a clothing store]", hue: "#8E7CC3",
    opener: "Hi! Welcome in. Let me know if you need any help finding something.",
    openerVi: "Chào bạn! Mời vào. Cần tìm gì cứ nói mình nhé.",
    starters: [
      { vi: "Hỏi giá", scene: "the user asks how much an item costs" },
      { vi: "Thử đồ", scene: "the user wants to try something on; help them" },
      { vi: "Đổi trả hàng", scene: "the user wants to return or exchange an item" },
    ] },
  { id: "doctor", icon: "🩺", vi: "Ở phòng khám", en: "At the doctor", desc: "Mô tả triệu chứng", seed: "[TOPIC: At the doctor — a gentle, patient doctor]", hue: "#5BA86F",
    opener: "Hello, come on in and have a seat. So, what brings you in today?",
    openerVi: "Chào bạn, mời vào ngồi. Hôm nay bạn thấy trong người thế nào?",
    starters: [
      { vi: "Mô tả triệu chứng", scene: "the user describes their symptoms to you, the doctor" },
      { vi: "Hỏi về thuốc", scene: "the user asks about medicine and how to take it" },
      { vi: "Đặt lịch tái khám", scene: "the user books a follow-up appointment" },
    ] },
];
const OPENING = "Hi! I'm Toki. How are you today?";

const FUN_TOPICS = [
  { id: "argue", icon: "🔥", vi: "Cãi nhau cho vui", en: "Debate me", desc: "Toki cãi tay đôi, ai thắng?", seed: "[TOPIC: Playful debate — you are a witty, stubborn debate opponent who argues the opposite side for fun, never mean]", hue: "#E0533D",
    opener: "Okay, I'll say it: pineapple absolutely belongs on pizza. Fight me! What's your hot take?",
    openerVi: "Được, mình nói luôn: dứa CỰC HỢP với pizza đó. Cãi lại đi! Quan điểm gây sốc của bạn là gì?",
    starters: [
      { vi: "Dứa trên pizza?", scene: "debate whether pineapple belongs on pizza; you defend YES and push back playfully" },
      { vi: "Mèo hay chó?", scene: "debate cats vs dogs; stubbornly take the opposite side from the user, playfully" },
      { vi: "iPhone hay Android?", scene: "debate iPhone vs Android; take the opposite side, playful and spicy" },
    ] },
  { id: "vent", icon: "😮‍💨", vi: "Xả stress", en: "Vent to me", desc: "Than thở một ngày mệt mỏi", seed: "[TOPIC: A warm, supportive friend who lets the user vent about their day and helps them feel lighter]", hue: "#6FA8C9",
    opener: "Ugh, rough day? Come here, tell me everything. What happened?",
    openerVi: "Ui, ngày tệ hả? Lại đây, kể hết cho mình nghe. Có chuyện gì vậy?",
    starters: [
      { vi: "Công việc áp lực", scene: "the user vents about work stress; listen warmly, then gently lighten the mood" },
      { vi: "Mệt chuyện học", scene: "the user vents about studying; be supportive and warm" },
      { vi: "Bực chuyện nhỏ", scene: "the user rants about a small annoying thing; be funny and validating" },
    ] },
  { id: "silly", icon: "🤪", vi: "Nói chuyện vô tri", en: "Silly talk", desc: "Tám chuyện trời ơi đất hỡi", seed: "[TOPIC: Absurd, silly, meme-y nonsense chat — keep it light, funny, zero stakes]", hue: "#C98A3A",
    opener: "Important question: if you were a vegetable, which one would you be, and why?",
    openerVi: "Câu hỏi quan trọng nè: nếu bạn là một loại rau củ, bạn sẽ là rau gì, và vì sao?",
    starters: [
      { vi: "Câu hỏi vô tri", scene: "ask the user a silly hypothetical question and riff on their answer" },
      { vi: "Nếu mèo biết nói", scene: "imagine together what cats would say if they could talk" },
      { vi: "Siêu năng lực vô dụng", scene: "chat about the most useless superpower to have" },
    ] },
  { id: "partner", icon: "💑", vi: "Người yêu giận dỗi", en: "Couple's spat", desc: "Cãi yêu chuyện việc nhà", seed: "[TOPIC: A playful, comedic partner having a light-hearted lovers' spat — PG, funny, affectionate, never sexual or cruel]", hue: "#D17BA0",
    opener: "Babe, seriously? I did the dishes three times this week. When was the last time YOU took out the trash, hmm?",
    openerVi: "Cưng ơi, thật hả? Tuần này tớ rửa bát ba lần rồi đó. Lần cuối CẬU đổ rác là khi nào, hửm?",
    starters: [
      { vi: "Ai làm việc nhà nhiều hơn", scene: "argue playfully about who does more housework; stay affectionate and funny" },
      { vi: "Quên nhắn tin lại", scene: "a playful spat about not texting back; keep it light and comedic" },
      { vi: "Đi chơi không rủ", scene: "a playful spat about going out without inviting them; comedic and warm" },
    ] },
  { id: "celeb", icon: "🌟", vi: "Phỏng vấn sao", en: "You're famous", desc: "Bạn là ngôi sao, Toki phỏng vấn", seed: "[TOPIC: A starstruck talk-show host interviewing the user as if they are a famous celebrity]", hue: "#9B7FD4",
    opener: "Ladies and gentlemen, our special guest is finally here! So tell us — what's it like being THIS famous?",
    openerVi: "Thưa quý vị, khách mời đặc biệt đã đến! Kể nghe nào — làm người nổi tiếng cỡ này cảm giác ra sao?",
    starters: [
      { vi: "Bí quyết thành công", scene: "interview the user about their secret to success, treating them as a star" },
      { vi: "Tin đồn về bạn", scene: "playfully ask the celebrity user about a funny rumor" },
      { vi: "Dự án sắp tới", scene: "ask the celebrity user about their next big project" },
    ] },
];

function parseReply(text) {
  let t = (text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s !== -1 && e !== -1) t = t.slice(s, e + 1);
  try {
    const o = JSON.parse(t);
    return {
      spoken_reply: o.spoken_reply || "Sorry, could you say that again?",
      vi_translation: o.vi_translation || "",
      scaffold_chips: Array.isArray(o.scaffold_chips) ? o.scaffold_chips.slice(0, 4) : [],
      errors_noticed: Array.isArray(o.errors_noticed) ? o.errors_noticed : [],
      encouragement: o.encouragement || "",
    };
  } catch {
    return { spoken_reply: (text || "Let's keep going! Tell me one small thing about your day.").trim(), vi_translation: "", scaffold_chips: [], errors_noticed: [], encouragement: "" };
  }
}
// LOCAL DEV: calls the backend /api/chat (which holds the API key and talks to Claude).
// Vite proxies /api -> http://localhost:8787 (see vite.config.js).
async function callToki(history) {
  const res = await fetch("/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: history }),
  });
  if (!res.ok) throw new Error("api");
  const r = await res.json();
  return {
    spoken_reply: r.spoken_reply || "Sorry, could you say that again?",
    vi_translation: r.vi_translation || "",
    scaffold_chips: Array.isArray(r.scaffold_chips) ? r.scaffold_chips.slice(0, 4) : [],
    errors_noticed: Array.isArray(r.errors_noticed) ? r.errors_noticed : [],
    encouragement: r.encouragement || "",
  };
}

/* ============================== STYLES ============================== */
const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Nunito:wght@500;600;700;800&display=swap');
.dn{--paper:#FFF6EA;--card:#FFFFFF;--ink:#2E2A24;--muted:#A89E8C;--green:#12A974;--green-d:#0C8A5E;--coral:#FF6B45;--sun:#FFAE2E;--line:#F0E4D0;--user:#12A974;font-family:'Nunito',sans-serif;color:var(--ink);height:100%;}
.dn *{box-sizing:border-box;}
.disp{font-family:'Fraunces',serif;}
.wrap{min-height:100%;background:radial-gradient(120% 55% at 100% 0%,#FFE6BE 0%,#FFF6EA 46%),radial-gradient(120% 65% at 0% 100%,#CDF3E2 0%,#FFF6EA 50%);display:flex;justify-content:center;align-items:stretch;padding:16px;}
.phone{width:100%;max-width:420px;background:var(--paper);border:1px solid var(--line);border-radius:34px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 70px -30px rgba(60,50,30,.4);min-height:640px;max-height:780px;position:relative;}

/* mascot */
.toki{border-radius:50%;background:radial-gradient(circle at 34% 28%,#65C0A2,#2F8F73 72%);position:relative;flex:none;box-shadow:0 6px 16px -6px rgba(47,143,115,.7);}
.toki:before,.toki:after{content:"";position:absolute;border-radius:50%;background:#fff;}
.toki i{position:absolute;border-bottom:2.5px solid #fff;border-radius:0 0 60% 60%;}
.toki.lg{width:88px;height:88px;animation:breathe 4.5s ease-in-out infinite;}
.toki.lg:before,.toki.lg:after{top:34px;width:9px;height:9px;}.toki.lg:before{left:27px}.toki.lg:after{right:27px}.toki.lg i{left:31px;bottom:23px;width:26px;height:13px}
.toki.sm{width:38px;height:38px;}
.toki.sm:before,.toki.sm:after{top:14px;width:4.5px;height:4.5px;}.toki.sm:before{left:11px}.toki.sm:after{right:11px}.toki.sm i{left:13px;bottom:10px;width:12px;height:6px}
@keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}

/* welcome */
.welcome{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px 32px;}
.welcome h1{font-size:38px;font-weight:700;margin:18px 0 0;letter-spacing:-.5px;}
.welcome .tag{font-size:15.5px;color:var(--muted);font-weight:700;margin:6px 0 0;}
.welcome .promise{font-style:italic;font-size:21px;color:var(--green-d);margin:26px 0 0;line-height:1.4;}
.cta{margin-top:28px;background:var(--green);color:#fff;border:none;font-family:'Nunito';font-weight:800;font-size:17px;padding:15px 40px;border-radius:30px;cursor:pointer;box-shadow:0 12px 28px -10px rgba(47,143,115,.85);transition:.15s;}
.cta:hover{background:var(--green-d);transform:translateY(-2px);}
.welcome .fine{font-size:12.5px;color:var(--muted);margin-top:16px;font-weight:600;}

/* home / topics */
.home-h{padding:22px 22px 8px;}
.home-h .hi{font-size:13px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:1.2px;}
.home-h h2{font-family:'Fraunces',serif;font-size:27px;font-weight:600;margin:3px 0 0;}
.streakbar{display:flex;gap:9px;padding:12px 22px 4px;}
.pill{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:800;padding:7px 13px;border-radius:30px;border:1px solid var(--line);background:var(--card);}
.pill.fire{color:var(--coral);} .pill.min{color:var(--green-d);}
.ask{font-family:'Fraunces',serif;font-size:18px;font-weight:600;padding:16px 22px 8px;}
.grid{flex:1;overflow-y:auto;padding:4px 16px 18px;display:grid;grid-template-columns:1fr 1fr;gap:12px;align-content:start;}
.tcard{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:16px 15px 15px;cursor:pointer;text-align:left;transition:.16s;position:relative;overflow:visible;font-family:'Nunito';animation:pop .4s both;align-self:start;}
.tcard:hover{transform:translateY(-3px);box-shadow:0 16px 30px -16px rgba(60,50,30,.4);}
.tcard .ic{width:42px;height:42px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px;margin-bottom:11px;}
.tcard .vi{font-size:16.5px;font-weight:800;}
.tcard .en{font-size:12.5px;color:var(--muted);font-weight:700;}
.tcard .ds{font-size:12px;color:var(--muted);font-weight:600;margin-top:7px;line-height:1.4;}
.tcard.free{grid-column:1 / -1;background:linear-gradient(125deg,#15B87E,#0C8A5E);border:none;color:#fff;box-shadow:0 14px 28px -14px rgba(18,169,116,.7);}
.section-head{grid-column:1 / -1;font-family:'Fraunces',serif;font-size:17px;font-weight:600;color:var(--ink);padding:14px 4px 2px;display:flex;align-items:center;gap:6px;}
.tcard.free .en,.tcard.free .ds{color:#ffffffcc;}
.tcard.free .ic{background:#ffffff26;}
@keyframes pop{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1}}

/* conversation */
.chat-h{display:flex;align-items:center;gap:11px;padding:14px 16px;border-bottom:1px solid var(--line);background:var(--paper);}
.backb{border:none;background:transparent;cursor:pointer;color:var(--muted);display:flex;padding:4px;border-radius:50%;}
.backb:hover{color:var(--green-d);background:#0000000a;}
.chat-h .name{font-weight:800;font-size:16px;}
.chat-h .sub{font-size:12px;color:var(--muted);font-weight:700;}
.chat-h .tools{margin-left:auto;display:flex;gap:4px;}
.tbtn{border:none;background:transparent;color:var(--muted);cursor:pointer;padding:8px;border-radius:50%;display:flex;}
.tbtn:hover{background:#0000000a;color:var(--green-d);}
.tbtn.act{color:var(--green);background:#2f8f7314;}
.minirev{margin-left:2px;font-size:12px;font-weight:800;color:var(--muted);background:transparent;border:1px dashed var(--line);padding:6px 10px;border-radius:30px;cursor:pointer;}
.minirev:hover{color:var(--green-d);border-color:var(--green);}
.tbtn.rev{position:relative;}
.badge{position:absolute;top:-1px;right:-1px;background:var(--coral);color:#fff;font-size:9.5px;font-weight:800;min-width:15px;height:15px;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0 3px;}
.finb{margin-left:2px;font-family:'Nunito';font-size:13px;font-weight:800;color:#fff;background:var(--coral);border:none;padding:8px 15px;border-radius:30px;cursor:pointer;transition:.14s;box-shadow:0 6px 14px -6px rgba(255,107,69,.7);}
.finb:hover{filter:brightness(1.05);transform:translateY(-1px);}

/* finish / celebration screen */
.finish{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px 28px;position:relative;overflow:hidden;}
.confetti{position:absolute;top:-12px;width:9px;height:14px;border-radius:2px;opacity:.9;animation:fall linear infinite;}
@keyframes fall{0%{transform:translateY(-20px) rotate(0);opacity:0}10%{opacity:1}100%{transform:translateY(620px) rotate(540deg);opacity:.4}}
.finish .pop{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:var(--coral);margin-top:14px;}
.finish h2{font-family:'Fraunces',serif;font-size:32px;font-weight:700;margin:4px 0 2px;}
.finish .sub{font-size:15px;color:var(--muted);font-weight:700;max-width:280px;line-height:1.5;margin:0 0 6px;}
.stats{display:flex;gap:10px;margin:20px 0 4px;width:100%;justify-content:center;}
.stat{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:14px 12px;min-width:84px;}
.stat .n{font-family:'Fraunces',serif;font-size:25px;font-weight:700;line-height:1;}
.stat .l{font-size:11.5px;color:var(--muted);font-weight:800;margin-top:5px;text-transform:uppercase;letter-spacing:.5px;}
.stat.g .n{color:var(--green-d);} .stat.c .n{color:var(--coral);} .stat.s .n{color:var(--sun);}
.streakbig{display:flex;align-items:center;gap:8px;background:#FF6B450f;border:1px solid #FF6B4533;color:var(--coral);font-weight:800;font-size:15px;padding:10px 18px;border-radius:30px;margin:18px 0 2px;}
.finish .praise{font-style:italic;font-family:'Fraunces',serif;font-size:17px;color:var(--green-d);max-width:290px;line-height:1.45;margin:16px 0 0;}
.finbtns{display:flex;flex-direction:column;gap:10px;width:100%;margin-top:24px;}
.finbtns .pri{background:var(--green);color:#fff;border:none;font-family:'Nunito';font-weight:800;font-size:16px;padding:15px;border-radius:28px;cursor:pointer;box-shadow:0 12px 26px -10px rgba(18,169,116,.8);transition:.15s;}
.finbtns .pri:hover{background:var(--green-d);transform:translateY(-2px);}
.finbtns .sec{background:transparent;color:var(--muted);border:1.5px solid var(--line);font-family:'Nunito';font-weight:800;font-size:15px;padding:13px;border-radius:28px;cursor:pointer;}
.finbtns .sec:hover{color:var(--green-d);border-color:var(--green);}

.feed{flex:1;overflow-y:auto;padding:18px 16px 6px;display:flex;flex-direction:column;gap:13px;scroll-behavior:smooth;}
.row{display:flex;flex-direction:column;animation:rise .42s cubic-bezier(.2,.8,.2,1) both;max-width:84%;}
.row.t{align-self:flex-start;align-items:flex-start;}
.row.u{align-self:flex-end;align-items:flex-end;}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1}}
.bub{padding:12px 16px;border-radius:21px;font-size:15.5px;line-height:1.5;font-weight:600;}
.bub.t{background:var(--card);border:1px solid var(--line);border-bottom-left-radius:7px;}
.bub.u{background:var(--user);color:#fff;border-bottom-right-radius:7px;}
.mtools{display:flex;gap:5px;margin-top:6px;padding-left:3px;}
.mtb{display:flex;align-items:center;gap:5px;font-size:11.5px;font-weight:800;color:var(--muted);background:var(--card);border:1px solid var(--line);padding:5px 10px;border-radius:30px;cursor:pointer;transition:.14s;}
.mtb:hover{color:var(--green-d);border-color:var(--green);}
.mtb.on{color:var(--green-d);border-color:var(--green);background:#2f8f730f;}
.vihint{margin-top:7px;font-size:13.5px;color:var(--green-d);background:#2f8f730d;border:1px dashed #2f8f7333;border-radius:13px;padding:8px 12px;font-weight:700;font-style:italic;animation:rise .3s both;}
.enc{align-self:center;font-size:12.5px;font-weight:800;color:var(--green-d);background:#2f8f730f;border:1px solid #2f8f7322;padding:7px 14px;border-radius:30px;display:flex;gap:6px;align-items:center;margin:2px 0;animation:rise .5s both;}
.dots{display:flex;gap:4px;padding:13px 16px;background:var(--card);border:1px solid var(--line);border-radius:21px;border-bottom-left-radius:7px;}
.dots span{width:7px;height:7px;border-radius:50%;background:var(--green);opacity:.5;animation:blink 1.2s infinite;}
.dots span:nth-child(2){animation-delay:.2s}.dots span:nth-child(3){animation-delay:.4s}
@keyframes blink{0%,100%{opacity:.3;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}

.chips{display:flex;flex-wrap:wrap;gap:8px;padding:4px 16px 10px;}
.scene-div{align-self:center;font-size:12px;font-weight:800;color:var(--muted);background:#0000000a;border:1px solid var(--line);padding:6px 14px;border-radius:30px;margin:4px 0;}
.starters{padding:2px 16px 2px;}
.starters-label{font-size:11.5px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;padding:0 2px 7px;}
.chip.scene-chip{color:var(--coral);border-color:#FF6B4540;}
.chip.scene-chip:hover{background:var(--coral);color:#fff;border-color:var(--coral);}
.chip{font-family:'Nunito';font-size:14px;font-weight:800;color:var(--green-d);background:var(--card);border:1.5px solid #2f8f7340;padding:9px 15px;border-radius:30px;cursor:pointer;transition:.15s;animation:rise .4s both;}
.chip:hover{background:var(--green);color:#fff;border-color:var(--green);transform:translateY(-1px);}

/* input — audio first */
.inbar{padding:12px 16px 16px;border-top:1px solid var(--line);background:var(--paper);display:flex;flex-direction:column;gap:10px;}
.micwrap{display:flex;align-items:center;justify-content:center;gap:14px;}
.bigmic{width:74px;height:74px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;background:var(--green);box-shadow:0 14px 30px -10px rgba(47,143,115,.8);transition:.16s;position:relative;}
.bigmic:hover:not(:disabled){background:var(--green-d);transform:scale(1.04);}
.bigmic:disabled{opacity:.45;cursor:default;}
.bigmic.on{background:var(--coral);box-shadow:0 14px 30px -8px rgba(221,115,80,.8);}
.bigmic.on:before{content:"";position:absolute;inset:-7px;border-radius:50%;border:3px solid #DD735055;animation:ring 1.2s ease-out infinite;}
@keyframes ring{0%{transform:scale(1);opacity:.9}100%{transform:scale(1.35);opacity:0}}
.mhint{font-size:12.5px;color:var(--muted);font-weight:700;text-align:center;}
.typerow{display:flex;align-items:center;gap:8px;}
.txt{flex:1;border:1.5px solid var(--line);background:var(--card);border-radius:22px;padding:10px 15px;font-size:14.5px;font-family:'Nunito';font-weight:600;color:var(--ink);outline:none;}
.txt:focus{border-color:var(--green);}
.txt::placeholder{color:#bdb6a5;}
.sendb{flex:none;width:40px;height:40px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;background:var(--green);}
.sendb:disabled{opacity:.4;cursor:default;}

/* review drawer */
.drawer{position:absolute;inset:0;background:#3a382fa8;display:flex;align-items:flex-end;border-radius:34px;animation:fade .25s;}
@keyframes fade{from{opacity:0}to{opacity:1}}
.sheet{background:var(--paper);width:100%;border-radius:26px 26px 34px 34px;padding:22px;max-height:76%;overflow-y:auto;animation:rise .3s both;}
.sheet h3{font-family:'Fraunces',serif;font-size:22px;font-weight:600;margin:0 0 3px;display:flex;gap:8px;align-items:center;}
.sheet .lead{font-size:13.5px;color:var(--muted);font-weight:700;margin:0 0 15px;line-height:1.5;}
.err{background:var(--card);border:1px solid var(--line);border-radius:15px;padding:12px 15px;margin-bottom:10px;}
.err .said{font-size:14px;color:var(--muted);text-decoration:line-through;font-weight:700;}
.err .nat{font-size:15.5px;color:var(--green-d);font-weight:800;margin-top:3px;}
.empty{text-align:center;color:var(--muted);font-weight:700;font-size:14px;padding:26px 0;line-height:1.6;}
.closeb{position:absolute;top:16px;right:16px;background:var(--card);border:1px solid var(--line);border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--muted);}
`;

/* ============================== APP ============================== */
function Toki({ size }) { return <div className={`toki ${size}`}><i /></div>; }

export default function App() {
  const [screen, setScreen] = useState("welcome"); // welcome | home | chat
  const [topic, setTopic] = useState(null);
  const [ui, setUi] = useState([]);
  const [history, setHistory] = useState([]);
  const [chips, setChips] = useState([]);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [ttsOn, setTtsOn] = useState(true);
  const [slow, setSlow] = useState(false);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState("");
  const [showReview, setShowReview] = useState(false);
  const [revealed, setRevealed] = useState({}); // msgIndex -> bool
  const [elapsed, setElapsed] = useState(0);
  const [words, setWords] = useState(0);
  const [streak] = useState(1);
  const [starters, setStarters] = useState([]);
  const [showStarters, setShowStarters] = useState(false);

  const feedRef = useRef(null);
  const silenceRef = useRef({ count: 0, timer: null });
  const recogRef = useRef(null);
  const ttsRef = useRef(true), slowRef = useRef(false);
  useEffect(() => { ttsRef.current = ttsOn; }, [ttsOn]);
  useEffect(() => { slowRef.current = slow; }, [slow]);

  const sttSupported = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

  const speak = useCallback((text) => {
    if (!ttsRef.current || typeof window === "undefined" || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US"; u.rate = slowRef.current ? 0.72 : 0.96; u.pitch = 1.05;
      const v = window.speechSynthesis.getVoices().find((x) => /en[-_]/i.test(x.lang));
      if (v) u.voice = v;
      window.speechSynthesis.speak(u);
    } catch {}
  }, []);

  useEffect(() => { if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; }, [ui, chips, loading]);
  useEffect(() => { if (screen !== "chat") return; const id = setInterval(() => setElapsed((e) => e + 1), 1000); return () => clearInterval(id); }, [screen]);

  const clearSilence = () => { if (silenceRef.current.timer) clearTimeout(silenceRef.current.timer); };
  const armSilence = useCallback(() => {
    clearSilence();
    if (silenceRef.current.count >= 3) return;
    silenceRef.current.timer = setTimeout(() => { silenceRef.current.count += 1; sendTurn(`[USER_SILENT count=${silenceRef.current.count}]`, { silent: true }); }, 27000);
  }, []);

  const sendTurn = useCallback(async (content, opts = {}) => {
    clearSilence();
    setShowStarters(false);
    if (opts.scene) {
      silenceRef.current.count = 0;
      setUi((p) => [...p, { who: "scene", text: opts.sceneLabel }]);
    } else if (!opts.silent) {
      silenceRef.current.count = 0;
      setUi((p) => [...p, { who: "u", text: content }]);
      setWords((w) => w + content.trim().split(/\s+/).filter(Boolean).length);
    }
    setChips([]); setLoading(true);
    const nextHist = [...history, { role: "user", content }];
    setHistory(nextHist);
    try {
      const r = await callToki(nextHist);
      setHistory((h) => [...h, { role: "assistant", content: r.spoken_reply }]);
      setUi((p) => [...p, { who: "t", text: r.spoken_reply, vi: r.vi_translation, enc: r.encouragement }]);
      setChips(r.scaffold_chips || []);
      if (r.errors_noticed?.length) setErrors((e) => [...e, ...r.errors_noticed]);
      speak(r.spoken_reply);
    } catch {
      const fb = "Hmm, I didn't catch that — but no worries. Tell me one small thing about your day?";
      setUi((p) => [...p, { who: "t", text: fb, vi: "Hmm, mình chưa nghe rõ — không sao cả. Kể mình nghe một điều nhỏ trong ngày của bạn nhé?" }]);
      setHistory((h) => [...h, { role: "assistant", content: fb }]); speak(fb);
    } finally { setLoading(false); armSilence(); }
  }, [history, speak, armSilence]);

  const handleSend = (text) => { const t = (text != null ? text : input).trim(); if (!t || loading) return; setInput(""); sendTurn(t); };
  const startScene = (s) => { if (loading) return; sendTurn(`[SCENE: ${s.scene}]`, { scene: true, sceneLabel: s.vi }); };

  const openTopic = (tp) => {
    setTopic(tp); setScreen("chat");
    const opener = tp.opener || OPENING;
    setUi([{ who: "t", text: opener, vi: tp.openerVi || "" }]);
    setHistory([
      { role: "user", content: `[SESSION_START] ${tp.seed}` },
      { role: "assistant", content: opener },
    ]);
    setChips([]); setErrors([]); setRevealed({}); setElapsed(0); setWords(0);
    setStarters(tp.starters || []); setShowStarters((tp.starters || []).length > 0);
    silenceRef.current.count = 0;
    setTimeout(() => speak(opener), 380); armSilence();
  };

  const leave = () => { clearSilence(); if (window.speechSynthesis) window.speechSynthesis.cancel(); setScreen("home"); };
  const finish = () => { clearSilence(); if (window.speechSynthesis) window.speechSynthesis.cancel(); setListening(false); setScreen("finish"); };

  const micErrMsg = (code) => ({
    "not-allowed": "Micro bị chặn. Mở System Settings › Privacy & Security › Microphone, bật cho Chrome, rồi tải lại trang.",
    "service-not-allowed": "Micro bị chặn ở cấp hệ thống. Bật cho Chrome trong System Settings › Privacy & Security › Microphone.",
    "audio-capture": "Không tìm thấy micro. Kiểm tra thiết bị thu âm của máy.",
    "network": "Nhận giọng nói cần Internet (Chrome gửi lên dịch vụ Google). Kiểm tra mạng / VPN / tường lửa.",
    "no-speech": "Chưa nghe thấy gì — thử nói to hơn một chút nhé.",
    "aborted": "",
  }[code] ?? `Micro lỗi (${code}). Cứ gõ chữ bên dưới cũng được nhé.`);

  const toggleMic = () => {
    if (!sttSupported) { setMicError("Trình duyệt này không hỗ trợ nhận giọng nói. Hãy dùng Chrome, hoặc gõ chữ bên dưới."); return; }
    if (listening) { try { recogRef.current?.stop(); } catch {} return; }
    setMicError("");
    try {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new SR(); rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 1;
      rec.onstart = () => setListening(true);
      rec.onresult = (e) => { const said = e.results[0][0].transcript; setListening(false); handleSend(said); };
      rec.onerror = (e) => { setListening(false); setMicError(micErrMsg(e.error)); };
      rec.onend = () => setListening(false);
      recogRef.current = rec; rec.start();
    } catch (e) { setListening(false); setMicError("Không khởi động được micro. Thử tải lại trang, hoặc gõ chữ bên dưới."); }
  };

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <div className="dn">
      <style>{STYLE}</style>
      <div className="wrap">
        <div className="phone">

          {screen === "welcome" && (
            <div className="welcome">
              <Toki size="lg" />
              <h1 className="disp">Dám Nói</h1>
              <p className="tag">nói tiếng Anh, không sợ sai</p>
              <p className="promise disp">"Cứ nói đi.<br/>Đừng sợ sai."</p>
              <button className="cta" onClick={() => setScreen("home")}>Bắt đầu</button>
              <p className="fine">Toki nói tiếng Anh · bí từ cứ chêm tiếng Việt</p>
            </div>
          )}

          {screen === "home" && (
            <>
              <div className="home-h">
                <div className="hi">Hôm nay nói gì nào</div>
                <h2 className="disp">Chào bạn 👋</h2>
              </div>
              <div className="streakbar">
                <span className="pill fire"><Flame size={15} /> {streak} ngày</span>
                <span className="pill min"><Sparkles size={15} /> Sẵn sàng nói</span>
              </div>
              <div className="ask disp">Chọn một tình huống — hoặc cứ nói tự do</div>
              <div className="grid">
                {TOPICS.map((tp, i) => (
                  <button key={tp.id} className={`tcard ${tp.id === "free" ? "free" : ""}`} style={{ animationDelay: `${i * 45}ms` }} onClick={() => openTopic(tp)}>
                    <div className="ic" style={{ background: tp.id === "free" ? undefined : `${tp.hue}1a`, color: tp.hue }}>
                      {tp.icon === "rabbit" ? <Rabbit size={22} color="#fff" /> : tp.icon}
                    </div>
                    <div className="vi">{tp.vi}</div>
                    <div className="en">{tp.en}</div>
                    <div className="ds">{tp.desc}</div>
                  </button>
                ))}
                <div className="section-head">🔥 Vui &amp; Viral — nói cho sướng miệng</div>
                {FUN_TOPICS.map((tp, i) => (
                  <button key={tp.id} className="tcard" style={{ animationDelay: `${i * 45}ms` }} onClick={() => openTopic(tp)}>
                    <div className="ic" style={{ background: `${tp.hue}1a`, color: tp.hue }}>{tp.icon}</div>
                    <div className="vi">{tp.vi}</div>
                    <div className="en">{tp.en}</div>
                    <div className="ds">{tp.desc}</div>
                  </button>
                ))}
              </div>
            </>
          )}

          {screen === "chat" && (
            <>
              <div className="chat-h">
                <button className="backb" onClick={leave}><ChevronLeft size={24} /></button>
                <Toki size="sm" />
                <div>
                  <div className="name">Toki</div>
                  <div className="sub">{loading ? "đang nghe…" : topic?.vi}</div>
                </div>
                <div className="tools">
                  <button className={`tbtn ${slow ? "act" : ""}`} title="Nói chậm lại" onClick={() => setSlow((v) => !v)}><Rabbit size={19} /></button>
                  <button className="tbtn" title="Bật/tắt giọng" onClick={() => { setTtsOn((v) => !v); if (window.speechSynthesis) window.speechSynthesis.cancel(); }}>{ttsOn ? <Volume2 size={19} /> : <VolumeX size={19} />}</button>
                  <button className="tbtn rev" title="Xem lại" onClick={() => setShowReview(true)}><Sparkles size={19} />{errors.length > 0 && <span className="badge">{errors.length}</span>}</button>
                  <button className="finb" onClick={finish}>Xong</button>
                </div>
              </div>

              <div className="feed" ref={feedRef}>
                {ui.map((m, i) => (
                  <React.Fragment key={i}>
                    {m.who === "scene" ? (
                      <div className="scene-div">{m.text}</div>
                    ) : (
                      <div className={`row ${m.who}`}>
                        <div className={`bub ${m.who}`}>{m.text}</div>
                        {m.who === "t" && (
                          <>
                            <div className="mtools">
                              <button className="mtb" onClick={() => speak(m.text)}><Play size={12} /> Nghe lại</button>
                              {m.vi && <button className={`mtb ${revealed[i] ? "on" : ""}`} onClick={() => setRevealed((r) => ({ ...r, [i]: !r[i] }))}><Languages size={12} /> {revealed[i] ? "Ẩn" : "Dịch"}</button>}
                            </div>
                            {revealed[i] && m.vi && <div className="vihint">{m.vi}</div>}
                          </>
                        )}
                      </div>
                    )}
                    {m.enc && <div className="enc"><Sparkles size={13} /> {m.enc}</div>}
                  </React.Fragment>
                ))}
                {loading && <div className="row t"><div className="dots"><span /><span /><span /></div></div>}
              </div>

              {showStarters && starters.length > 0 && !loading && (
                <div className="starters">
                  <div className="starters-label">Chọn một tình huống — hoặc cứ nói luôn</div>
                  <div className="chips">
                    {starters.map((s, i) => <button key={i} className="chip scene-chip" style={{ animationDelay: `${i * 55}ms` }} onClick={() => startScene(s)}>{s.vi}</button>)}
                  </div>
                </div>
              )}

              {chips.length > 0 && !loading && (
                <div className="chips">
                  {chips.map((c, i) => <button key={i} className="chip" style={{ animationDelay: `${i * 55}ms` }} onClick={() => handleSend(c)}>{c}</button>)}
                </div>
              )}

              <div className="inbar">
                <div className="micwrap">
                  <button className={`bigmic ${listening ? "on" : ""}`} disabled={!sttSupported || loading} title={sttSupported ? "Nhấn để nói" : "Trình duyệt không hỗ trợ mic — hãy gõ bên dưới"} onClick={toggleMic}>
                    <Mic size={30} />
                  </button>
                </div>
                <div className="mhint" style={micError ? { color: "var(--coral)" } : undefined}>{micError ? micError : listening ? "Đang nghe… cứ nói thoải mái" : sttSupported ? "Nhấn để nói — hoặc gõ bên dưới" : "Gõ câu của bạn bên dưới"}</div>
                <div className="typerow">
                  <input className="txt" value={input} placeholder="Nói gì cũng được… bí từ cứ chêm tiếng Việt"
                    onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }} />
                  <button className="sendb" disabled={loading || !input.trim()} onClick={() => handleSend()}><Send size={17} /></button>
                </div>
              </div>
            </>
          )}

          {screen === "finish" && (
            <div className="finish">
              {Array.from({ length: 14 }).map((_, i) => (
                <span key={i} className="confetti" style={{
                  left: `${(i * 7 + 4) % 100}%`,
                  background: [ "#12A974", "#FF6B45", "#FFAE2E", "#15B87E" ][i % 4],
                  animationDuration: `${2.6 + (i % 5) * 0.5}s`,
                  animationDelay: `${(i % 7) * 0.25}s`,
                }} />
              ))}
              <Toki size="lg" />
              <div className="pop">Bạn vừa làm được</div>
              <h2 className="disp">Tuyệt vời! 🎉</h2>
              <p className="sub">Bạn vừa nói tiếng Anh về cuộc sống thật của mình — phần khó nhất, và bạn đã làm được.</p>
              <div className="stats">
                <div className="stat g"><div className="n">{mmss}</div><div className="l">Phút nói</div></div>
                <div className="stat c"><div className="n">{words}</div><div className="l">Từ đã nói</div></div>
                <div className="stat s"><div className="n">{errors.length}</div><div className="l">Cách nói mới</div></div>
              </div>
              <div className="streakbig"><Flame size={18} /> {streak} ngày liên tiếp — giữ lửa nhé!</div>
              <p className="praise disp">"Mỗi lần bạn dám mở miệng là một lần can đảm. Hẹn mai gặp lại?"</p>
              <div className="finbtns">
                <button className="pri" onClick={() => { setScreen("home"); }}>Hẹn mai gặp lại 🔥</button>
                <button className="sec" onClick={() => { setScreen("chat"); armSilence(); }}>Nói thêm chút nữa</button>
                {errors.length > 0 && <button className="sec" onClick={() => setShowReview(true)}>Xem lại {errors.length} cách nói mới</button>}
              </div>
            </div>
          )}

          {showReview && (
            <div className="drawer" onClick={() => setShowReview(false)}>
              <div className="sheet" onClick={(e) => e.stopPropagation()}>
                <button className="closeb" onClick={() => setShowReview(false)}><X size={18} /></button>
                <h3 className="disp"><Sparkles size={20} color="#2F8F73" /> Xem lại nhẹ nhàng</h3>
                <p className="lead">Bạn đã nói rất tốt. Đây là vài cách nói còn tự nhiên hơn — chỉ để tham khảo thôi nhé, không phải lỗi.</p>
                {errors.length === 0 ? (
                  <div className="empty">Chưa có gì để xem lại.<br/>Cứ thoải mái nói tiếp đi nhé!</div>
                ) : errors.map((e, i) => (
                  <div className="err" key={i}><div className="said">{e.said}</div><div className="nat">{e.natural}</div></div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
