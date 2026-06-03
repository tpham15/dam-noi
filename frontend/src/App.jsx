import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, Send, Volume2, VolumeX, RotateCcw, X, Sparkles, Flame, Clock, Play, Languages, Rabbit, ChevronLeft, BookOpen, TrendingUp, Keyboard } from "lucide-react";

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
    openers: [
      ["Hi! I'm Toki. How are you today?", "Chào bạn! Mình là Toki. Hôm nay bạn thế nào?"],
      ["Hey there! I'm Toki. What's on your mind right now?", "Chào bạn! Mình là Toki. Bạn đang nghĩ gì trong đầu thế?"],
      ["Hi, I'm Toki! Tell me, how's your day going so far?", "Chào, mình là Toki! Kể nghe nào, ngày hôm nay của bạn sao rồi?"],
      ["Hello! I'm Toki. What did you do today?", "Xin chào! Mình là Toki. Hôm nay bạn đã làm gì?"],
    ],
    opener: "Hi! I'm Toki. How are you today?",
    openerVi: "Chào bạn! Mình là Toki. Hôm nay bạn thế nào?",
    starters: [
      { vi: "Kể về ngày hôm nay", scene: "ask the user warmly about their day so far" },
      { vi: "Sở thích của tôi", scene: "ask the user about a hobby they enjoy" },
      { vi: "Phim & nhạc", scene: "chat about movies or music the user likes" },
      { vi: "Ước mơ của tôi", scene: "ask the user gently about a dream or goal" },
    ] },
  { id: "smalltalk", icon: "☕", vi: "Chuyện phiếm", en: "Small talk", desc: "Bắt chuyện thật nhẹ nhàng", seed: "[TOPIC: Small talk — a friendly stranger at a cozy cafe]", hue: "#C98A3A",
    openers: [
      ["Hey! Mind if I sit here? This cafe is so busy today.", "Chào bạn! Mình ngồi đây được không? Quán hôm nay đông quá."],
      ["Oh, I love your jacket! Where did you get it?", "Ồ, mình thích áo khoác của bạn ghê! Bạn mua ở đâu vậy?"],
      ["Hi! Is it just me, or is the weather amazing today?", "Chào bạn! Tại mình thôi hay là thời tiết hôm nay đẹp thật?"],
      ["Hey, do you come to this cafe often? It's my first time.", "Chào bạn, bạn hay ghé quán này không? Mình lần đầu tới đây."],
    ],
    opener: "Hey! Mind if I sit here? This cafe is so busy today.",
    openerVi: "Chào bạn! Mình ngồi đây được không? Quán hôm nay đông quá.",
    starters: [
      { vi: "Khen quán cà phê", scene: "the user compliments the cafe; react and chat" },
      { vi: "Nói về thời tiết", scene: "make small talk about today's weather" },
      { vi: "Hỏi về cuối tuần", scene: "ask the user about their weekend plans" },
    ] },
  { id: "work", icon: "💻", vi: "Đi làm", en: "At work", desc: "Daily standup, họp nhóm", seed: "[TOPIC: Work — a relaxed daily standup with a friendly coworker]", hue: "#3E78B0",
    openers: [
      ["Morning! Ready for our quick standup? So, what did you work on yesterday?", "Chào buổi sáng! Sẵn sàng họp standup nhanh chưa? Hôm qua bạn làm gì nhỉ?"],
      ["Hey, good morning! How's that project coming along?", "Chào buổi sáng! Dự án đó tiến triển sao rồi?"],
      ["Morning! Coffee first, then tell me what you're working on today?", "Chào buổi sáng! Cà phê trước đã, rồi kể mình nghe hôm nay bạn làm gì nhé?"],
      ["Hi! Quick check-in before the meeting. Anything blocking you?", "Chào bạn! Trao đổi nhanh trước cuộc họp nhé. Có gì đang vướng không?"],
    ],
    opener: "Morning! Ready for our quick standup? So, what did you work on yesterday?",
    openerVi: "Chào buổi sáng! Sẵn sàng họp standup nhanh chưa? Hôm qua bạn làm gì nhỉ?",
    starters: [
      { vi: "Báo cáo tiến độ", scene: "the user gives a short progress update at standup" },
      { vi: "Nói về khó khăn", scene: "the user describes a blocker or difficulty at work" },
      { vi: "Hỏi đồng nghiệp giúp", scene: "the user asks a coworker for help on a task" },
    ] },
  { id: "interview", icon: "🎯", vi: "Phỏng vấn", en: "Job interview", desc: "Luyện trả lời tự tin", seed: "[TOPIC: Job interview — a warm, encouraging interviewer]", hue: "#B05B8E",
    openers: [
      ["Hi, thanks for coming in! Make yourself comfortable. So, tell me a little about yourself.", "Chào bạn, cảm ơn đã đến! Cứ thoải mái nhé. Bạn giới thiệu một chút về bản thân nhé?"],
      ["Welcome! Great to meet you. What made you apply for this role?", "Chào mừng bạn! Rất vui được gặp. Điều gì khiến bạn ứng tuyển vị trí này?"],
      ["Hello! Thanks for your time. Can you walk me through your background?", "Xin chào! Cảm ơn bạn đã dành thời gian. Bạn kể mình nghe về quá trình của bạn nhé?"],
      ["Hi there! Relax, this is just a chat. What are you most proud of so far?", "Chào bạn! Cứ thư giãn, mình trò chuyện thôi. Điều bạn tự hào nhất tới giờ là gì?"],
    ],
    opener: "Hi, thanks for coming in! Make yourself comfortable. So, tell me a little about yourself.",
    openerVi: "Chào bạn, cảm ơn đã đến! Cứ thoải mái nhé. Bạn giới thiệu một chút về bản thân nhé?",
    starters: [
      { vi: "Giới thiệu bản thân", scene: "the user introduces themselves to the interviewer" },
      { vi: "Điểm mạnh của tôi", scene: "the interviewer asks about the user's strengths" },
      { vi: "Vì sao ứng tuyển", scene: "the interviewer asks why the user wants this job" },
    ] },
  { id: "travel", icon: "✈️", vi: "Du lịch", en: "Travel", desc: "Sân bay, khách sạn, hỏi đường", seed: "[TOPIC: Travel English practice]", hue: "#3FA6A0",
    openers: [
      ["Hi! I'm Toki, your travel buddy. Pick a spot below, or just start talking.", "Chào bạn! Mình là Toki, bạn đồng hành du lịch. Chọn bên dưới, hoặc cứ nói luôn."],
      ["Hey traveler! Where are we off to today? Pick a scene or just chat.", "Chào lữ khách! Hôm nay mình đi đâu nào? Chọn một tình huống hoặc cứ nói chuyện."],
      ["Hi! Ready for an adventure? Tell me where you'd love to go.", "Chào bạn! Sẵn sàng phiêu lưu chưa? Kể mình nghe bạn muốn đi đâu."],
    ],
    opener: "Hi! I'm Toki, your travel buddy. Imagine we're on a trip — where shall we start? Pick a spot below, or just start talking.",
    openerVi: "Chào bạn! Mình là Toki, bạn đồng hành du lịch của bạn. Mình đang trong chuyến đi nhé — bắt đầu từ đâu? Chọn bên dưới, hoặc cứ nói luôn.",
    starters: [
      { vi: "Ở sân bay", scene: "at the airport check-in counter, you are the airline staff" },
      { vi: "Hỏi đường", scene: "the user asks you for directions on the street" },
      { vi: "Nhận phòng khách sạn", scene: "checking into a hotel, you are the receptionist" },
      { vi: "Gọi taxi", scene: "the user is getting a taxi; you are the driver" },
    ] },
  { id: "food", icon: "🍜", vi: "Gọi món", en: "Ordering food", desc: "Nhà hàng, quán cà phê", seed: "[TOPIC: Ordering food — a friendly waiter at a restaurant]", hue: "#FF6B45",
    openers: [
      ["Hi there, welcome in! Here's the menu. Can I get you something to drink first?", "Chào bạn, mời vào! Đây là thực đơn. Bạn dùng đồ uống gì trước nhé?"],
      ["Good evening! Table for one? Let me show you our specials today.", "Chào buổi tối! Bàn một người à? Để mình giới thiệu các món đặc biệt hôm nay nhé."],
      ["Welcome! Have you eaten with us before, or is this your first time?", "Chào mừng bạn! Bạn ăn ở đây bao giờ chưa, hay đây là lần đầu?"],
      ["Hi! Hungry today? What are you in the mood for?", "Chào bạn! Hôm nay đói chưa? Bạn đang thèm món gì nào?"],
    ],
    opener: "Hi there, welcome in! Here's the menu. Can I get you something to drink first?",
    openerVi: "Chào bạn, mời vào! Đây là thực đơn. Bạn dùng đồ uống gì trước nhé?",
    starters: [
      { vi: "Gọi món chính", scene: "the user orders a main dish; you are the waiter" },
      { vi: "Hỏi món chay", scene: "the user asks about vegetarian options" },
      { vi: "Xin tính tiền", scene: "the user asks for the bill" },
    ] },
  { id: "shopping", icon: "🛍️", vi: "Mua sắm", en: "Shopping", desc: "Hỏi giá, thử đồ, đổi trả", seed: "[TOPIC: Shopping — a helpful shop assistant in a clothing store]", hue: "#8E7CC3",
    openers: [
      ["Hi! Welcome in. Let me know if you need any help finding something.", "Chào bạn! Mời vào. Cần tìm gì cứ nói mình nhé."],
      ["Hey there! Everything on this rack is on sale today. Looking for anything special?", "Chào bạn! Cả kệ này hôm nay đang giảm giá đó. Bạn tìm món gì đặc biệt không?"],
      ["Hi! Love that you stopped by. What brings you in today?", "Chào bạn! Vui vì bạn ghé qua. Hôm nay bạn cần gì nào?"],
      ["Welcome! New collection just arrived. Want me to show you around?", "Chào mừng bạn! Bộ sưu tập mới vừa về. Bạn muốn mình dẫn đi xem một vòng không?"],
    ],
    opener: "Hi! Welcome in. Let me know if you need any help finding something.",
    openerVi: "Chào bạn! Mời vào. Cần tìm gì cứ nói mình nhé.",
    starters: [
      { vi: "Hỏi giá", scene: "the user asks how much an item costs" },
      { vi: "Thử đồ", scene: "the user wants to try something on; help them" },
      { vi: "Đổi trả hàng", scene: "the user wants to return or exchange an item" },
    ] },
  { id: "doctor", icon: "🩺", vi: "Ở phòng khám", en: "At the doctor", desc: "Mô tả triệu chứng", seed: "[TOPIC: At the doctor — a gentle, patient doctor]", hue: "#5BA86F",
    openers: [
      ["Hello, come on in and have a seat. So, what brings you in today?", "Chào bạn, mời vào ngồi. Hôm nay bạn thấy trong người thế nào?"],
      ["Hi there, good to see you. How have you been feeling lately?", "Chào bạn, rất vui được gặp. Dạo này bạn thấy trong người ra sao?"],
      ["Hello! Take your time. Tell me what's been bothering you.", "Xin chào! Cứ từ từ nhé. Kể mình nghe điều gì đang làm bạn khó chịu."],
    ],
    opener: "Hello, come on in and have a seat. So, what brings you in today?",
    openerVi: "Chào bạn, mời vào ngồi. Hôm nay bạn thấy trong người thế nào?",
    starters: [
      { vi: "Mô tả triệu chứng", scene: "the user describes their symptoms to you, the doctor" },
      { vi: "Hỏi về thuốc", scene: "the user asks about medicine and how to take it" },
      { vi: "Đặt lịch tái khám", scene: "the user books a follow-up appointment" },
    ] },
];
const OPENING = "Hi! I'm Toki. How are you today?";

const JOBS = [
  { id: "student", icon: "🎓", vi: "Học sinh / Sinh viên" },
  { id: "dev", icon: "💻", vi: "Lập trình / IT" },
  { id: "office", icon: "🗂️", vi: "Dân văn phòng" },
  { id: "banker", icon: "🏦", vi: "Ngân hàng / Tài chính" },
  { id: "sales", icon: "🤝", vi: "Sales / Kinh doanh" },
  { id: "creator", icon: "🎬", vi: "Sáng tạo / Marketing" },
  { id: "teacher", icon: "📚", vi: "Giáo viên" },
  { id: "healthcare", icon: "🩺", vi: "Y tế" },
  { id: "freelance", icon: "🦅", vi: "Freelancer" },
  { id: "other", icon: "✨", vi: "Khác / Chưa đi làm" },
];

// Pick a random opener for a topic. Prefers the openers[] array; falls back to
// the single opener/openerVi fields if present.
function pickOpener(tp) {
  if (tp.openers && tp.openers.length) {
    const [opener, openerVi] = tp.openers[Math.floor(Math.random() * tp.openers.length)];
    return { opener, openerVi };
  }
  return { opener: tp.opener || OPENING, openerVi: tp.openerVi || "" };
}

const FUN_TOPICS = [
  { id: "roast", icon: "😈", vi: "Bị Toki khịa", en: "Roast me", desc: "Toki khịa hết cỡ, bạn chịu nổi không?", seed: "[TOPIC: ROAST MODE — sassy English roast battle, user opted in]", hue: "#E0533D",
    openers: [
      ["Oh, you actually pressed this? Brave. Okay hotshot, say literally anything in English and let's see what we're working with.", "Ồ, bạn bấm vào thật à? Gan đấy. Được rồi siêu sao, nói gì đó bằng tiếng Anh đi, xem trình tới đâu nào."],
      ["Welcome to the roast zone. No participation trophies here. Go on, impress me, I'll wait.", "Chào mừng tới khu vực bị khịa. Ở đây không có giải khuyến khích đâu. Nào, làm mình lác mắt đi, mình đợi."],
      ["So you want the truth, not the cuddles? Respect. Say something in English, I dare you.", "Vậy là bạn muốn sự thật chứ không phải lời dỗ ngọt? Nể đấy. Nói gì đó bằng tiếng Anh đi, dám không?"],
      ["Look who showed up. Let's see if your English is as confident as that tap was. Go.", "Xem ai tới kìa. Để xem tiếng Anh của bạn có tự tin như cú bấm vừa rồi không. Nói đi."],
    ],
    opener: "Oh, you actually pressed this? Brave. Say something in English and let's see what we're working with.",
    starters: [
      { vi: "Tôi sẵn sàng, khịa đi", scene: "the user says they're ready; roast their English confidently but funny" },
      { vi: "Kể về ngày của tôi", scene: "the user tells you about their day; roast playfully and keep them talking" },
      { vi: "Tôi giỏi tiếng Anh lắm", scene: "the user brags they're good at English; playfully challenge them to prove it" },
    ] },
  { id: "argue", icon: "🔥", vi: "Cãi nhau cho vui", en: "Debate me", desc: "Toki cãi tay đôi, ai thắng?", seed: "[TOPIC: Playful debate — you are a witty, stubborn debate opponent who argues the opposite side for fun, never mean]", hue: "#E0533D",
    openers: [
      ["Okay, I'll say it: pineapple absolutely belongs on pizza. Fight me! What's your hot take?", "Được, mình nói luôn: dứa CỰC HỢP với pizza đó. Cãi lại đi! Quan điểm gây sốc của bạn là gì?"],
      ["Hot take: cereal is a soup. I'm right and you know it. Convince me otherwise!", "Quan điểm gây sốc: ngũ cốc là một loại súp. Mình đúng và bạn biết mà. Thử thuyết phục mình đi!"],
      ["I'll die on this hill: mornings are better than nights. Come on, argue with me!", "Mình quyết không lùi: buổi sáng tuyệt hơn buổi tối. Nào, cãi với mình đi!"],
      ["Real talk: money absolutely can buy happiness. Prove me wrong!", "Nói thật nhé: tiền chắc chắn mua được hạnh phúc. Chứng minh mình sai đi!"],
    ],
    opener: "Okay, I'll say it: pineapple absolutely belongs on pizza. Fight me! What's your hot take?",
    openerVi: "Được, mình nói luôn: dứa CỰC HỢP với pizza đó. Cãi lại đi! Quan điểm gây sốc của bạn là gì?",
    starters: [
      { vi: "Dứa trên pizza?", scene: "debate whether pineapple belongs on pizza; you defend YES and push back playfully" },
      { vi: "Mèo hay chó?", scene: "debate cats vs dogs; stubbornly take the opposite side from the user, playfully" },
      { vi: "iPhone hay Android?", scene: "debate iPhone vs Android; take the opposite side, playful and spicy" },
    ] },
  { id: "vent", icon: "😮‍💨", vi: "Xả stress", en: "Vent to me", desc: "Than thở một ngày mệt mỏi", seed: "[TOPIC: A warm, supportive friend who lets the user vent about their day and helps them feel lighter]", hue: "#6FA8C9",
    openers: [
      ["Ugh, rough day? Come here, tell me everything. What happened?", "Ui, ngày tệ hả? Lại đây, kể hết cho mình nghe. Có chuyện gì vậy?"],
      ["Hey, you look like you need to get something off your chest. I'm all ears.", "Này, trông bạn như đang có gì muốn trút ra. Mình nghe đây."],
      ["Long day, huh? Sit down, breathe. What's been on your mind?", "Ngày dài nhỉ? Ngồi xuống, thở cái đã. Có gì trong đầu bạn vậy?"],
      ["Hi, friend. No judgment here. What's stressing you out today?", "Chào bạn. Ở đây không phán xét gì đâu. Hôm nay điều gì làm bạn căng thẳng?"],
    ],
    opener: "Ugh, rough day? Come here, tell me everything. What happened?",
    openerVi: "Ui, ngày tệ hả? Lại đây, kể hết cho mình nghe. Có chuyện gì vậy?",
    starters: [
      { vi: "Công việc áp lực", scene: "the user vents about work stress; listen warmly, then gently lighten the mood" },
      { vi: "Mệt chuyện học", scene: "the user vents about studying; be supportive and warm" },
      { vi: "Bực chuyện nhỏ", scene: "the user rants about a small annoying thing; be funny and validating" },
    ] },
  { id: "silly", icon: "🤪", vi: "Nói chuyện vô tri", en: "Silly talk", desc: "Tám chuyện trời ơi đất hỡi", seed: "[TOPIC: Absurd, silly, meme-y nonsense chat — keep it light, funny, zero stakes]", hue: "#C98A3A",
    openers: [
      ["Important question: In the song Chị ong nâu và em bé, where is the chị ong flying to?", "Câu hỏi quan trọng nè: Trong bài hát Chị ong nâu và em bé, Chị ong bay đi đâu?"],
      ["Okay random question: If a mosquito gets bitten by another mosquito, does it itch?", "Câu hỏi ngẫu hứng nè: Nếu một con muỗi đốt một con muỗi khác, thì con muỗi bị đốt có bị ngứa không?"],
      ["Burning question: If I work to buy food to survive to work... am I working to eat or eating to work?", "Nếu mình đi làm để kiếm tiền mua đồ ăn lấy sức đi làm... vậy mục đích cuối cùng của mình là đi làm hay là để ăn?"],
      ["Quick! You just won a lottery. What would you do?", "Nhanh nào! Bạn vừa trúng số. Bạn tính làm gì?"],
    ],
    opener: "Important question: In the song Chị ong nâu và em bé, where is the chị ong flying to?",
    openerVi: "Câu hỏi quan trọng nè: Trong bài hát Chị ong nâu và em bé, Chị ong bay đi đâu?",
    starters: [
      { vi: "Câu hỏi vô tri", scene: "ask the user a silly hypothetical question and riff on their answer" },
      { vi: "Nếu mèo biết nói", scene: "imagine together what cats would say if they could talk" },
      { vi: "Siêu năng lực vô dụng", scene: "chat about the most useless superpower to have" },
    ] },
  { id: "partner", icon: "💑", vi: "Người yêu giận dỗi", en: "Couple's spat", desc: "Cãi yêu chuyện thường ngày", seed: "[TOPIC: A playful, comedic partner having a light-hearted lovers' spat — PG, funny, affectionate, never sexual or cruel]", hue: "#D17BA0",
    openers: [
      ["If I turned into a caterpillar in the future, would you still keep me as a pet? Or would you throw me away because you're scared of getting itchy?", "Cưng ơi, Nếu sau này me biến thành một con sâu róm, you có nuôi me tiếp không, hay cưng vứt me đi vì sợ ngứa?"],
      ["If someone offered you 10 billion VND to break up with me for a month, and we'd get back together after that, would you do it? Why?", "Nếu có người trả me 10 tỷ để you chia tay me trong vòng 1 tháng, xong tháng sau mình quay lại, you có chia tay me không, tại sao?"],
      ["You said five more minutes... an hour ago. We're so late! What happened?", "you bảo năm phút nữa... từ một tiếng trước. Trễ lắm rồi đó! Sao vậy?"],
      ["Hmm, you've been on your phone all dinner. Is something more interesting than me?", "Hừm, cả bữa tối you cứ dán mắt vào điện thoại. Có gì thú vị hơn me à?"],
    ],
    opener: "If I turned into a caterpillar in the future, would you still keep me as a pet? Or would you throw me away because you're scared of getting itchy?",
    openerVi: "Cưng ơi, Nếu sau này me biến thành một con sâu róm, you có nuôi me tiếp không, hay cưng vứt me đi vì sợ ngứa?",
    starters: [
      { vi: "dán mắt vào điện thoại", scene: "complain about using phone; stay funny" },
      { vi: "câu hỏi gen Z làm nũng", scene: "a playful spat about silly things; keep it light and comedic" },
      { vi: "Đi chơi không rủ", scene: "a playful spat about going out without inviting them; comedic and warm" },
    ] },
  { id: "celeb", icon: "🌟", vi: "Phỏng vấn sao", en: "You're famous", desc: "Bạn là ngôi sao, Toki phỏng vấn", seed: "[TOPIC: A starstruck talk-show host interviewing the user as if they are a famous celebrity]", hue: "#9B7FD4",
    openers: [
      ["Ladies and gentlemen, our special guest is finally here! So tell us, what's it like being THIS famous?", "Thưa quý vị, khách mời đặc biệt đã đến! Kể nghe nào, làm người nổi tiếng cỡ này cảm giác ra sao?"],
      ["Welcome to the show! The fans are going wild. How do you handle all this attention?", "Chào mừng đến với chương trình! Người hâm mộ phát cuồng kìa. Bạn xoay sở với sự chú ý này thế nào?"],
      ["It's THE superstar everyone's talking about! Tell me, what's a normal day like for you?", "Đây rồi, siêu sao mà ai cũng nhắc tới! Kể nghe nào, một ngày bình thường của bạn ra sao?"],
      ["So great to have you! First question everyone wants to know: what's your big secret?", "Thật tuyệt khi có bạn ở đây! Câu đầu tiên ai cũng muốn biết: bí mật lớn của bạn là gì?"],
    ],
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
// Backend API base. Local dev: leave VITE_API_BASE unset -> "" -> "/api" goes
// through the Vite proxy. Production: set VITE_API_BASE to the deployed backend
// URL (e.g. https://damnoi-backend.onrender.com) so the web app calls it directly.
const API = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
const DEVICE_KEY = "damnoi_user_id";
function getUserId() { try { return localStorage.getItem(DEVICE_KEY) || null; } catch { return null; } }
function setUserId(id) { try { localStorage.setItem(DEVICE_KEY, id); } catch {} }
const JOB_KEY = "damnoi_job";
function getJob() { try { return localStorage.getItem(JOB_KEY) || ""; } catch { return ""; } }
function setJob(j) { try { localStorage.setItem(JOB_KEY, j); } catch {} }
const ACCT_KEY = "moho_account";
function getAccount() { try { return JSON.parse(localStorage.getItem(ACCT_KEY) || "null"); } catch { return null; } }
function setAccount(a) { try { a ? localStorage.setItem(ACCT_KEY, JSON.stringify(a)) : localStorage.removeItem(ACCT_KEY); } catch {} }
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

// Send the Google credential to the backend; it returns the account user id.
async function apiGoogleLogin(credential) {
  const res = await fetch(`${API}/api/auth/google`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential, deviceUserId: getUserId() }),
  });
  if (!res.ok) throw new Error("login");
  return res.json(); // { userId, email, name, streakDays, job }
}

// Load Google Identity Services script once.
let googleScriptPromise = null;
function loadGoogleScript() {
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("google script failed"));
    document.head.appendChild(s);
  });
  return googleScriptPromise;
}

async function apiStartSession(topicSeed, greeting) {
  const res = await fetch(`${API}/api/session/start`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: getUserId(), topicSeed, greeting, job: getJob() }),
  });
  if (!res.ok) throw new Error("start");
  const r = await res.json();
  if (r.userId) setUserId(r.userId);
  return r; // { userId, sessionId, sessionNumber, streakDays, greeting }
}

async function apiTurn({ userId, sessionId, text, secondsSpoken = 0, silentCount = 0 }) {
  const res = await fetch(`${API}/api/turn`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, sessionId, text, secondsSpoken, silentCount }),
  });
  if (!res.ok) throw new Error("turn");
  const r = await res.json();
  return {
    roast_vi: r.roast_vi || "",
    next_en: r.next_en || "",
    vi_translation: r.vi_translation || "",
    scaffold_chips: Array.isArray(r.scaffold_chips) ? r.scaffold_chips.slice(0, 4) : [],
    encouragement: r.encouragement || "",
    streakDays: r.streakDays,
    errorsThisTurn: r.errorsThisTurn || 0,
    limitReached: !!r.limitReached,
  };
}

async function apiReview(userId) {
  const res = await fetch(`${API}/api/review?userId=${encodeURIComponent(userId)}`);
  if (!res.ok) return [];
  const r = await res.json();
  return Array.isArray(r.items) ? r.items : [];
}

async function apiVocab(userId) {
  const res = await fetch(`${API}/api/vocab?userId=${encodeURIComponent(userId)}`);
  if (!res.ok) return [];
  const r = await res.json();
  return Array.isArray(r.items) ? r.items : [];
}

async function apiProgress(userId) {
  const res = await fetch(`${API}/api/progress?userId=${encodeURIComponent(userId)}`);
  if (!res.ok) return null;
  return await res.json();
}

/* ============================== STYLES ============================== */
const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
.dn{--paper:#15131C;--card:#211E2B;--ink:#F3EEF7;--muted:#B8B0C7;--muted-2:#8C8499;--green:#FF5E3A;--green-d:#FF7A4D;--coral:#FF5E3A;--sun:#FFB347;--line:#3A3548;--user:#FF5E3A;font-family:'Space Grotesk',sans-serif;color:var(--ink);height:100%;}
.dn *{box-sizing:border-box;}
.disp{font-family:'Space Grotesk',sans-serif;letter-spacing:-0.02em;}
.wrap{min-height:100%;background:radial-gradient(120% 55% at 100% 0%,#3A1E2E 0%,#0E0C14 46%),radial-gradient(120% 65% at 0% 100%,#2A1B3A 0%,#0E0C14 50%);display:flex;justify-content:center;align-items:stretch;padding:16px;}
.phone{width:100%;max-width:420px;background:var(--paper);border:1px solid var(--line);border-radius:34px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 70px -30px rgba(0,0,0,.6);min-height:640px;max-height:780px;position:relative;}

/* mascot */
.toki{position:relative;flex:none;background:transparent;display:flex;align-items:center;justify-content:center;}
.toki:before{content:"";position:absolute;inset:-18%;border-radius:50%;background:radial-gradient(circle at 50% 45%, rgba(255,94,58,.55), rgba(193,58,237,.35) 45%, transparent 70%);filter:blur(10px);z-index:0;pointer-events:none;}
.toki-img{position:relative;z-index:1;width:100%;height:100%;object-fit:contain;display:block;}
.toki.lg{width:96px;height:96px;animation:breathe 4.5s ease-in-out infinite;}
.toki.sm{width:40px;height:40px;}
.toki.md{width:68px;height:68px;}
.share{background:var(--coral);color:#fff;border:none;font-family:'Space Grotesk',sans-serif;font-weight:800;font-size:15px;padding:13px;border-radius:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;}
.bragcard{background:linear-gradient(150deg,#2A2436,#231C28);border:2px solid #FF5E3A55;border-radius:22px;padding:20px;margin-top:6px;}
.bragtop{display:flex;align-items:center;gap:12px;}
.bragname{font-family:'Space Grotesk',sans-serif;letter-spacing:-0.02em;font-size:19px;font-weight:600;color:var(--ink);}
.bragsub{font-size:13px;font-weight:800;color:var(--coral);}
.bragstats{display:flex;gap:10px;margin:16px 0;}
.bragstats div{flex:1;background:#15131C;border-radius:14px;padding:12px 6px;text-align:center;}
.bragstats b{display:block;font-family:'Space Grotesk',sans-serif;letter-spacing:-0.02em;font-size:22px;color:var(--green-d);}
.bragstats span{font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;}
.braglist{display:flex;flex-direction:column;gap:7px;}
.bragerr{font-size:14px;font-weight:700;color:var(--ink);}.bragerr s{color:var(--muted);}.bragerr b{color:var(--green-d);}
.bragfoot{margin-top:15px;text-align:center;font-style:italic;font-weight:700;color:var(--coral);font-size:14.5px;}
.toki.sm:after,.toki.sm i,.toki:after,.toki i{display:none;}
@keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}

/* welcome */
.welcome{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px 32px;}
.welcome h1{font-size:38px;font-weight:700;margin:18px 0 0;letter-spacing:-.5px;}
.welcome .tag{font-size:15.5px;color:#D9D3E3;font-weight:700;margin:6px 0 0;}
.welcome .promise{font-style:italic;font-size:21px;color:var(--green-d);margin:26px 0 0;line-height:1.4;}
.cta{margin-top:28px;background:var(--green);color:#fff;border:none;font-family:'Space Grotesk',sans-serif;font-weight:800;font-size:17px;padding:15px 40px;border-radius:30px;cursor:pointer;box-shadow:0 12px 28px -10px rgba(255,94,58,.5);transition:.15s;}
.cta:hover{background:var(--green-d);transform:translateY(-2px);}
.cta{box-shadow:0 0 0 1px #FF5E3A55, 0 10px 30px -8px rgba(255,94,58,.6), 0 0 40px -12px rgba(255,94,58,.7) !important;}
.bigmic{box-shadow:0 0 0 1px #FF5E3A55, 0 0 30px -6px rgba(255,94,58,.65) !important;}
.bigmic.on{box-shadow:0 0 0 2px #FF5E3A, 0 0 44px -4px rgba(255,94,58,.9) !important;}
.welcome .fine{font-size:12.5px;color:#D9D3E3;margin-top:16px;font-weight:600;}
.jobgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:22px;width:100%;max-width:420px;}
.jobcard{display:flex;align-items:center;gap:10px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px;cursor:pointer;font-family:'Space Grotesk',sans-serif;font-weight:800;font-size:14.5px;color:var(--ink);text-align:left;transition:.13s;}
.jobcard:hover{transform:translateY(-2px);border-color:var(--green);box-shadow:0 8px 18px -10px rgba(255,94,58,.4);}
.jobcard .jic{font-size:22px;}
.skip{margin-top:18px;background:none;border:none;color:var(--muted);font-family:'Space Grotesk',sans-serif;font-weight:800;font-size:14px;cursor:pointer;text-decoration:underline;}

/* home / topics */
.home-h{padding:20px 22px 4px;}
.home-h .hi{font-size:13px;color:var(--muted);font-weight:600;}
.home-h h2{font-family:'Space Grotesk',sans-serif;letter-spacing:-0.02em;font-size:26px;font-weight:700;margin:2px 0 0;}
.streakbar{display:flex;gap:8px;padding:14px 0 2px;flex-wrap:wrap;}
.pill{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:800;padding:7px 13px;border-radius:30px;border:1px solid var(--line);background:var(--card);}
.pill.fire{color:var(--coral);} .pill.min{color:var(--green-d);} .pill.book{color:#8E7CC3;}
.pill.save{color:var(--sun);border-color:#FFB34755;}
.pill.tap{cursor:pointer;transition:transform .12s,box-shadow .12s;}
.pill.tap:hover{transform:translateY(-1px);box-shadow:0 6px 14px -8px rgba(0,0,0,.25);}
.ask{font-family:'Space Grotesk',sans-serif;letter-spacing:-0.02em;font-size:18px;font-weight:600;padding:16px 22px 8px;}
.grid{flex:1;overflow-y:auto;padding:4px 16px 18px;display:grid;grid-template-columns:1fr 1fr;gap:12px;align-content:start;}
.tcard{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:16px 15px 15px;cursor:pointer;text-align:left;transition:.16s;position:relative;overflow:visible;font-family:'Space Grotesk',sans-serif;animation:pop .4s both;align-self:start;color:var(--ink);}
.tcard:hover{transform:translateY(-3px);box-shadow:0 16px 30px -16px rgba(0,0,0,.6);}
.tcard .ic{width:42px;height:42px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px;margin-bottom:11px;}
.tcard .vi{font-size:17px;font-weight:800;color:var(--ink);margin-top:2px;}
.tcard .en{font-size:12.5px;color:var(--coral);font-weight:700;}
.tcard .ds{font-size:12px;color:var(--muted);font-weight:500;margin-top:7px;line-height:1.4;}
.tcard.free{grid-column:1 / -1;background:linear-gradient(125deg,#FF5E3A,#FF3D6E);border:none;color:#fff;box-shadow:0 14px 28px -14px rgba(255,94,58,.45);}
.section-head{grid-column:1 / -1;font-family:'Space Grotesk',sans-serif;letter-spacing:-0.02em;font-size:17px;font-weight:600;color:var(--ink);padding:14px 4px 2px;display:flex;align-items:center;gap:6px;}
.hotwrap{padding:6px 22px 0;}
.hotcard{position:relative;width:100%;display:flex;align-items:center;gap:14px;padding:16px 18px;border:none;border-radius:20px;cursor:pointer;overflow:hidden;background:linear-gradient(110deg,#FF3D2E,#FF2D6E 60%,#C13AED);box-shadow:0 0 0 1px #FF5E3A55,0 14px 36px -12px rgba(255,61,46,.7),0 0 50px -16px rgba(255,45,110,.6);text-align:left;animation:pop .4s both;}
.hotcard:hover{transform:translateY(-2px);}
.hotglow{position:absolute;inset:0;background:radial-gradient(60% 120% at 15% 20%,rgba(255,255,255,.25),transparent 60%);pointer-events:none;}
.hotic{font-size:30px;flex:none;filter:drop-shadow(0 2px 4px rgba(0,0,0,.3));}
.hottxt{flex:1;min-width:0;}
.hotvi{font-size:19px;font-weight:800;color:#fff;letter-spacing:-0.01em;}
.hoten{font-size:12.5px;font-weight:600;color:#ffffffe0;margin-top:1px;}
.hotflame{color:#fff;flex:none;opacity:.9;}
.tcard.free .en,.tcard.free .ds{color:#ffffffcc;}
.tcard.free .ic{background:#ffffff26;}
@keyframes pop{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1}}

/* conversation */
.chat-h{display:flex;align-items:center;gap:11px;padding:14px 16px;border-bottom:1px solid var(--line);background:var(--paper);}
.backb{border:none;background:transparent;cursor:pointer;color:var(--muted);display:flex;padding:4px;border-radius:50%;}
.backb:hover{color:var(--green-d);background:#ffffff12;}
.chat-h .name{font-weight:800;font-size:16px;}
.chat-h .sub{font-size:12px;color:var(--muted);font-weight:700;}
.chat-h .tools{margin-left:auto;display:flex;gap:4px;}
.tbtn{border:none;background:transparent;color:var(--muted);cursor:pointer;padding:8px;border-radius:50%;display:flex;}
.tbtn:hover{background:#ffffff12;color:var(--green-d);}
.tbtn.act{color:var(--green);background:#FF5E3A22;}
.minirev{margin-left:2px;font-size:12px;font-weight:800;color:var(--muted);background:transparent;border:1px dashed var(--line);padding:6px 10px;border-radius:30px;cursor:pointer;}
.minirev:hover{color:var(--green-d);border-color:var(--green);}
.tbtn.rev{position:relative;}
.badge{position:absolute;top:-1px;right:-1px;background:var(--coral);color:#fff;font-size:9.5px;font-weight:800;min-width:15px;height:15px;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0 3px;}
.finb{margin-left:2px;font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:800;color:#fff;background:var(--coral);border:none;padding:8px 15px;border-radius:30px;cursor:pointer;transition:.14s;box-shadow:0 6px 14px -6px rgba(255,94,58,.5);}
.finb:hover{filter:brightness(1.05);transform:translateY(-1px);}

/* finish / celebration screen */
.finish{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px 28px;position:relative;overflow:hidden;}
.confetti{position:absolute;top:-12px;width:9px;height:14px;border-radius:2px;opacity:.9;animation:fall linear infinite;}
@keyframes fall{0%{transform:translateY(-20px) rotate(0);opacity:0}10%{opacity:1}100%{transform:translateY(620px) rotate(540deg);opacity:.4}}
.finish .pop{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:var(--coral);margin-top:14px;}
.finish h2{font-family:'Space Grotesk',sans-serif;letter-spacing:-0.02em;font-size:32px;font-weight:700;margin:4px 0 2px;}
.finish .sub{font-size:15px;color:var(--muted);font-weight:700;max-width:280px;line-height:1.5;margin:0 0 6px;}
.stats{display:flex;gap:10px;margin:20px 0 4px;width:100%;justify-content:center;}
.stat{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:14px 12px;min-width:84px;}
.stat .n{font-family:'Space Grotesk',sans-serif;letter-spacing:-0.02em;font-size:25px;font-weight:700;line-height:1;}
.stat .l{font-size:11.5px;color:var(--muted);font-weight:800;margin-top:5px;text-transform:uppercase;letter-spacing:.5px;}
.stat.g .n{color:var(--green-d);} .stat.c .n{color:var(--coral);} .stat.s .n{color:var(--sun);}
.streakbig{display:flex;align-items:center;gap:8px;background:#FF6B450f;border:1px solid #FF6B4533;color:var(--coral);font-weight:800;font-size:15px;padding:10px 18px;border-radius:30px;margin:18px 0 2px;}
.finish .praise{font-style:italic;font-family:'Space Grotesk',sans-serif;letter-spacing:-0.02em;font-size:17px;color:var(--green-d);max-width:290px;line-height:1.45;margin:16px 0 0;}
.finbtns{display:flex;flex-direction:column;gap:10px;width:100%;margin-top:24px;}
.finbtns .pri{background:var(--green);color:#fff;border:none;font-family:'Space Grotesk',sans-serif;font-weight:800;font-size:16px;padding:15px;border-radius:28px;cursor:pointer;box-shadow:0 12px 26px -10px rgba(18,169,116,.8);transition:.15s;}
.finbtns .pri:hover{background:var(--green-d);transform:translateY(-2px);}
.finbtns .sec{background:transparent;color:var(--muted);border:1.5px solid var(--line);font-family:'Space Grotesk',sans-serif;font-weight:800;font-size:15px;padding:13px;border-radius:28px;cursor:pointer;}
.finbtns .sec:hover{color:var(--green-d);border-color:var(--green);}

.feed{flex:1;overflow-y:auto;padding:18px 16px 6px;display:flex;flex-direction:column;gap:13px;scroll-behavior:smooth;}
.dn *::-webkit-scrollbar{width:6px;height:6px;}
.dn *::-webkit-scrollbar-track{background:transparent;}
.dn *::-webkit-scrollbar-thumb{background:#FF5E3A55;border-radius:10px;}
.dn *::-webkit-scrollbar-thumb:hover{background:#FF5E3A99;}
.dn *{scrollbar-width:thin;scrollbar-color:#FF5E3A55 transparent;}
.row{display:flex;flex-direction:column;animation:rise .42s cubic-bezier(.2,.8,.2,1) both;max-width:84%;}
.row.t{align-self:flex-start;align-items:flex-start;}
.row.u{align-self:flex-end;align-items:flex-end;}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1}}
.bub{padding:12px 16px;border-radius:21px;font-size:15.5px;line-height:1.5;font-weight:600;}
.bub.t{background:var(--card);border:1px solid var(--line);border-bottom-left-radius:7px;}
.bub.u{background:var(--user);color:#fff;border-bottom-right-radius:7px;}
.bub .roast{font-weight:800;font-style:italic;line-height:1.45;}
.bub .roast.fix{color:var(--coral);}
.bub .roast.hype{color:var(--sun);}
.bub .enline{margin-top:6px;}
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
.scene-div{align-self:center;font-size:12px;font-weight:800;color:var(--muted);background:#ffffff12;border:1px solid var(--line);padding:6px 14px;border-radius:30px;margin:4px 0;}
.starters{padding:2px 16px 2px;}
.starters-label{font-size:11.5px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;padding:0 2px 7px;}
.chip.scene-chip{color:var(--coral);border-color:#FF6B4540;}
.chip.scene-chip:hover{background:var(--coral);color:#fff;border-color:var(--coral);}
.chip{font-family:'Space Grotesk',sans-serif;font-size:14px;font-weight:800;color:var(--green-d);background:var(--card);border:1.5px solid #2f8f7340;padding:9px 15px;border-radius:30px;cursor:pointer;transition:.15s;animation:rise .4s both;}
.chip:hover{background:var(--green);color:#fff;border-color:var(--green);transform:translateY(-1px);}

/* input — audio first */
.inbar{padding:12px 16px 16px;border-top:1px solid var(--line);background:var(--paper);display:flex;flex-direction:column;gap:10px;}
.micwrap{display:flex;align-items:center;justify-content:center;gap:14px;}
.bigmic{width:74px;height:74px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;background:var(--green);box-shadow:0 14px 30px -10px rgba(47,143,115,.8);transition:.16s;position:relative;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none;}
.bigmic:hover:not(:disabled){background:var(--green-d);transform:scale(1.04);}
.bigmic:disabled{opacity:.45;cursor:default;}
.bigmic.on{background:var(--coral);box-shadow:0 14px 30px -8px rgba(221,115,80,.8);}
.bigmic.on:before{content:"";position:absolute;inset:-7px;border-radius:50%;border:3px solid #DD735055;animation:ring 1.2s ease-out infinite;}
@keyframes ring{0%{transform:scale(1);opacity:.9}100%{transform:scale(1.35);opacity:0}}
.mhint{font-size:12.5px;color:var(--muted);font-weight:700;text-align:center;}
.limitbox{text-align:center;padding:10px 14px;}
.limitt{font-weight:800;color:var(--coral);font-size:16px;}
.limitd{font-size:13px;color:var(--muted);font-weight:600;margin-top:5px;line-height:1.45;}
.microw{display:flex;align-items:center;justify-content:center;gap:18px;}
.kbtoggle,.kbspacer{width:44px;height:44px;flex:none;}
.kbtoggle{border-radius:50%;border:1px solid var(--line);background:var(--card);color:var(--muted);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:.14s;}
.kbtoggle:hover{color:var(--ink);border-color:var(--coral);}
.typewrap{display:flex;align-items:center;gap:8px;animation:slideup .2s ease both;}
.kbback{width:40px;height:40px;flex:none;border-radius:50%;border:none;background:var(--coral);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 0 18px -6px rgba(255,94,58,.6);}
@keyframes slideup{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.typerow{display:flex;align-items:center;gap:8px;}
.txt{flex:1;border:1.5px solid var(--line);background:var(--card);border-radius:22px;padding:10px 15px;font-size:14.5px;font-family:'Space Grotesk',sans-serif;font-weight:600;color:var(--ink);outline:none;}
.txt:focus{border-color:var(--green);}
.txt::placeholder{color:#bdb6a5;}
.sendb{flex:none;width:40px;height:40px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;background:var(--green);}
.sendb:disabled{opacity:.4;cursor:default;}

/* review drawer */
.drawer{position:absolute;inset:0;background:#3a382fa8;display:flex;align-items:flex-end;border-radius:34px;animation:fade .25s;}
@keyframes fade{from{opacity:0}to{opacity:1}}
.sheet{background:var(--paper);width:100%;border-radius:26px 26px 34px 34px;padding:22px;max-height:76%;overflow-y:auto;animation:rise .3s both;}
.sheet h3{font-family:'Space Grotesk',sans-serif;letter-spacing:-0.02em;font-size:22px;font-weight:600;margin:0 0 3px;display:flex;gap:8px;align-items:center;}
.sheet .lead{font-size:13.5px;color:var(--muted);font-weight:700;margin:0 0 15px;line-height:1.5;}
.err{background:var(--card);border:1px solid var(--line);border-radius:15px;padding:12px 15px;margin-bottom:10px;}
.err .said{font-size:14px;color:var(--muted);text-decoration:line-through;font-weight:700;}
.err .nat{font-size:15.5px;color:var(--green-d);font-weight:800;margin-top:3px;}
.vocab{background:var(--card);border:1px solid var(--line);border-radius:15px;padding:12px 15px;margin-bottom:10px;}
.vocab .vw{font-size:17px;color:var(--ink);font-weight:800;}
.vocab .vm{font-size:14px;color:var(--coral);font-weight:700;margin-top:2px;}
.vocab .ve{font-size:13.5px;color:var(--muted);font-style:italic;font-weight:600;margin-top:5px;}
.pgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.pstat{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;text-align:center;}
.pstat .pn{font-family:'Space Grotesk',sans-serif;letter-spacing:-0.02em;font-size:30px;font-weight:600;color:var(--green-d);line-height:1;}
.pstat .pl{font-size:11.5px;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.4px;margin-top:6px;}
.empty{text-align:center;color:var(--muted);font-weight:700;font-size:14px;padding:26px 0;line-height:1.6;}
.closeb{position:absolute;top:16px;right:16px;background:var(--card);border:1px solid var(--line);border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--muted);}
`;

/* ============================== APP ============================== */
function Toki({ size }) {
  return (
    <div className={`toki ${size}`}>
      <img src="/toki.png" alt="Toki" className="toki-img" />
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("welcome"); // welcome | home | chat
  const [topic, setTopic] = useState(null);
  const [ui, setUi] = useState([]);
  const [chips, setChips] = useState([]);
  const [errors, setErrors] = useState([]); // fetched from /api/review for the drawer
  const [errorCount, setErrorCount] = useState(0); // live count for the badge
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [ttsOn, setTtsOn] = useState(true);
  const [slow, setSlow] = useState(false);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState("");
  const [showReview, setShowReview] = useState(false);
  const [showVocab, setShowVocab] = useState(false);
  const [vocabItems, setVocabItems] = useState([]);
  const [showProgress, setShowProgress] = useState(false);
  const [progress, setProgress] = useState(null);
  const [showBrag, setShowBrag] = useState(false);
  const [revealed, setRevealed] = useState({}); // msgIndex -> bool
  const [elapsed, setElapsed] = useState(0);
  const [words, setWords] = useState(0);
  const [streak, setStreak] = useState(1);
  const [starting, setStarting] = useState(false);
  const [starters, setStarters] = useState([]);
  const [showStarters, setShowStarters] = useState(false);
  const [typing, setTyping] = useState(false); // silent-mode text input toggle
  const [limitHit, setLimitHit] = useState(false); // daily free cap reached
  const [account, setAccountState] = useState(() => getAccount()); // {email,name} when logged in
  const typingRef = useRef(false);
  useEffect(() => { typingRef.current = typing; }, [typing]);
  const sessionRef = useRef({ userId: null, sessionId: null });
  const lastSpokeRef = useRef(Date.now()); // to measure seconds spoken per turn

  const feedRef = useRef(null);
  const silenceRef = useRef({ count: 0, timer: null });
  const recogRef = useRef(null);
  const ttsRef = useRef(true), slowRef = useRef(false);
  useEffect(() => { ttsRef.current = ttsOn; }, [ttsOn]);
  useEffect(() => { slowRef.current = slow; }, [slow]);

  const sttSupported = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  useEffect(() => { if (!sttSupported) setTyping(true); }, [sttSupported]);

  const pickVoice = () => {
    const all = window.speechSynthesis.getVoices();
    const vs = all.filter((x) => /^en[-_]/i.test(x.lang));
    if (!vs.length) return null;
    const score = (v) => {
      const n = (v.name || "").toLowerCase();
      let s = 0;
      // Highest quality keywords across platforms (Apple/Google/MS neural voices).
      if (/(neural|natural|enhanced|premium|siri)/.test(n)) s += 100;
      if (/google/.test(n)) s += 60;          // Google voices on Chrome sound good
      if (/microsoft/.test(n) && /(aria|jenny|guy|natural)/.test(n)) s += 55;
      // Known decent named voices.
      if (/(samantha|karen|moira|tessa|serena|allison|ava|zoe|nathan)/.test(n)) s += 30;
      if (/^en-us/i.test(v.lang)) s += 8;      // prefer US accent slightly
      if (v.localService) s += 5;              // local = no network lag
      if (/(compact|eloquence|fred|albert|zarvox|novelty)/.test(n)) s -= 80; // robotic ones
      return s;
    };
    return vs.slice().sort((a, b) => score(b) - score(a))[0] || vs[0];
  };
  const audioRef = useRef(null);
  const chosenVoiceRef = useRef(null);
  const ttsFailedRef = useRef(false); // once backend TTS is known-unavailable, skip it
  const ttsCacheRef = useRef(new Map()); // sentence -> object URL, to avoid re-spending TTS quota
  const speakBrowser = useCallback((text) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US"; u.rate = slowRef.current ? 0.78 : 0.94; u.pitch = 1.0;
      const v = chosenVoiceRef.current || pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; }
      window.speechSynthesis.speak(u);
    } catch {}
  }, []);
  const speak = useCallback(async (text) => {
    if (!ttsRef.current || !text) return;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (audioRef.current) { try { audioRef.current.pause(); } catch {} }
    if (!ttsFailedRef.current) {
      try {
        const r = await fetch(`${API}/api/tts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
        if (r.ok) {
          const blob = await r.blob();
          const url = URL.createObjectURL(blob);
          const a = new Audio(url);
          a.playbackRate = slowRef.current ? 0.85 : 1;
          audioRef.current = a;
          a.onended = () => URL.revokeObjectURL(url);
          await a.play();
          return;
        }
        ttsFailedRef.current = true; // 501/502 -> stop trying, use browser voice
      } catch { ttsFailedRef.current = true; }
    }
    speakBrowser(text);
  }, [speakBrowser]);
  // Speak ONLY English. The Vietnamese correction is shown as text, never spoken.
  const speakBrowserEn = useCallback((enText) => {
    if (typeof window === "undefined" || !window.speechSynthesis || !enText) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(enText);
      u.lang = "en-US"; u.rate = slowRef.current ? 0.78 : 0.94; u.pitch = 1.0;
      const v = chosenVoiceRef.current || pickVoice(); if (v) { u.voice = v; u.lang = v.lang; }
      window.speechSynthesis.speak(u);
    } catch {}
  }, []);
  const speakEn = useCallback(async (enText) => {
    if (!ttsRef.current || !enText) return;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (audioRef.current) { try { audioRef.current.pause(); } catch {} }
    // Reuse cached audio for a sentence we've already fetched (saves Azure quota
    // on replays / repeated lines).
    const cached = ttsCacheRef.current.get(enText);
    if (cached) {
      try {
        const a = new Audio(cached);
        a.playbackRate = slowRef.current ? 0.85 : 1;
        audioRef.current = a;
        await a.play();
        return;
      } catch {}
    }
    // Try the high-quality Azure voice from the backend first.
    if (!ttsFailedRef.current) {
      try {
        const r = await fetch(`${API}/api/tts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: enText }) });
        if (r.ok) {
          const blob = await r.blob();
          const url = URL.createObjectURL(blob);
          ttsCacheRef.current.set(enText, url); // keep for replays
          const a = new Audio(url);
          a.playbackRate = slowRef.current ? 0.85 : 1;
          audioRef.current = a;
          await a.play();
          return;
        }
        ttsFailedRef.current = true; // 501/502 -> stop retrying, use browser voice
      } catch { ttsFailedRef.current = true; }
    }
    speakBrowserEn(enText); // fallback
  }, [speakBrowserEn]);
  const speakSeq = useCallback((_viText, enText) => speakEn(enText), [speakEn]);

  useEffect(() => { if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; }, [ui, chips, loading]);
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const warm = () => { try { window.speechSynthesis.getVoices(); chosenVoiceRef.current = pickVoice(); } catch {} };
    warm();
    window.speechSynthesis.addEventListener?.("voiceschanged", warm);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", warm);
  }, []);
  useEffect(() => { if (screen !== "chat") return; const id = setInterval(() => setElapsed((e) => e + 1), 1000); return () => clearInterval(id); }, [screen]);

  const clearSilence = () => { if (silenceRef.current.timer) clearTimeout(silenceRef.current.timer); };
  const armSilence = useCallback(() => {
    clearSilence();
    if (silenceRef.current.count >= 3) return;
    // Give people room to think. Longer on the first wait, a bit shorter after.
    // Typing takes longer than speaking, so wait generously — even more in typing mode.
    const base = typingRef.current ? 90000 : 55000;
    const waitMs = silenceRef.current.count === 0 ? base : Math.round(base * 0.75);
    silenceRef.current.timer = setTimeout(() => { silenceRef.current.count += 1; sendTurn(`[USER_SILENT count=${silenceRef.current.count}]`, { silent: true }); }, waitMs);
  }, []);

  const sendTurn = useCallback(async (content, opts = {}) => {
    clearSilence();
    setShowStarters(false);
    let secondsSpoken = 0;
    if (opts.scene) {
      silenceRef.current.count = 0;
      setUi((p) => [...p, { who: "scene", text: opts.sceneLabel }]);
    } else if (!opts.silent) {
      silenceRef.current.count = 0;
      secondsSpoken = Math.min(120, Math.round((Date.now() - lastSpokeRef.current) / 1000));
      setUi((p) => [...p, { who: "u", text: content }]);
      setWords((w) => w + content.trim().split(/\s+/).filter(Boolean).length);
    }
    setChips([]); setLoading(true);
    const { userId, sessionId } = sessionRef.current;
    try {
      const r = await apiTurn({
        userId, sessionId,
        text: opts.silent ? "" : content,
        secondsSpoken,
        silentCount: opts.silent ? silenceRef.current.count : 0,
      });
      const stripQ = (s) => String(s || "").trim().replace(/^["'“”]+|["'“”]+$/g, "").trim();
      const en = stripQ(r.next_en);
      // roast_vi is ALWAYS shown now: a Gen-Z hype line when correct, a tease+fix
      // when there's an error. isFix flags a real correction (for stronger styling).
      const isFix = Number(r.errorsThisTurn || 0) > 0;
      const roast = stripQ(r.roast_vi);
      setUi((p) => [...p, { who: "t", roast, isFix, en, vi: stripQ(r.vi_translation), enc: r.encouragement }]);
      setChips(r.scaffold_chips || []);
      if (r.limitReached) { setLimitHit(true); clearSilence(); }
      if (typeof r.streakDays === "number") setStreak(r.streakDays);
      if (r.errorsThisTurn) setErrorCount((c) => c + r.errorsThisTurn);
      speakEn(en); // only English is ever spoken
    } catch {
      const fbEn = "Hmm, say that again for me?";
      setUi((p) => [...p, { who: "t", roast: "", en: fbEn, vi: "" }]);
      speakEn(fbEn);
    } finally { setLoading(false); lastSpokeRef.current = Date.now(); armSilence(); }
  }, [speakEn, armSilence]);

  const handleSend = (text) => { const t = (text != null ? text : input).trim(); if (!t || loading) return; setInput(""); sendTurn(t); };
  const startScene = (s) => { if (loading) return; sendTurn(`[SCENE: ${s.scene}]`, { scene: true, sceneLabel: s.vi }); };

  // Called by Google with the signed credential after the user picks an account.
  const handleCredential = useCallback(async (response) => {
    try {
      const r = await apiGoogleLogin(response.credential);
      if (r.userId) setUserId(r.userId);
      const acct = { email: r.email, name: r.name };
      setAccount(acct); setAccountState(acct);
      if (typeof r.streakDays === "number") setStreak(r.streakDays);
    } catch {
      alert("Đăng nhập chưa được — thử lại nha.");
    }
  }, []);

  const doLogin = useCallback(async () => {
    if (!GOOGLE_CLIENT_ID) { alert("Login chưa cấu hình (thiếu Client ID)."); return; }
    try {
      await loadGoogleScript();
      window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleCredential });
      // Use the One Tap / prompt flow for a one-tap experience.
      window.google.accounts.id.prompt();
    } catch {
      alert("Không tải được Google. Kiểm tra mạng nha.");
    }
  }, [handleCredential]);

  const doLogout = useCallback(() => {
    setAccount(null); setAccountState(null);
    try { window.google?.accounts?.id?.disableAutoSelect?.(); } catch {}
    // Keep using the same userId locally; data stays under the account on the server.
  }, []);

  const openTopic = async (tp) => {
    if (starting) return;
    setStarting(true);
    setLimitHit(false);
    setTopic(tp); setScreen("chat");
    const { opener, openerVi } = pickOpener(tp);
    setUi([{ who: "t", text: opener, vi: openerVi }]);
    setChips([]); setErrors([]); setErrorCount(0); setRevealed({}); setElapsed(0); setWords(0);
    setStarters(tp.starters || []); setShowStarters((tp.starters || []).length > 0);
    silenceRef.current.count = 0;
    lastSpokeRef.current = Date.now();
    try {
      const s = await apiStartSession(tp.seed, opener);
      sessionRef.current = { userId: s.userId, sessionId: s.sessionId };
      if (typeof s.streakDays === "number") setStreak(s.streakDays);
    } catch {
      // If the backend is unreachable, the chat screen still shows but turns will
      // fail gracefully into the fallback line. Surface a gentle hint.
      setMicError("Chưa kết nối được máy chủ. Kiểm tra server backend có đang chạy không.");
    } finally { setStarting(false); }
    setTimeout(() => speak(opener), 380); armSilence();
  };

  const openReview = async () => {
    setShowReview(true);
    const { userId } = sessionRef.current;
    if (!userId) return;
    try { const items = await apiReview(userId); setErrors(items); setErrorCount(items.length); } catch {}
  };

  const openVocab = async () => {
    setShowVocab(true);
    const userId = sessionRef.current.userId || getUserId();
    if (!userId) return;
    try { setVocabItems(await apiVocab(userId)); } catch {}
  };

  const openProgress = async () => {
    setShowProgress(true);
    const userId = sessionRef.current.userId || getUserId();
    if (!userId) return;
    try { setProgress(await apiProgress(userId)); } catch {}
  };

  const openBrag = async () => {
    setShowBrag(true);
    const userId = sessionRef.current.userId || getUserId();
    if (!userId) return;
    try { const items = await apiReview(userId); setErrors(items); } catch {}
  };

  const copyBrag = () => {
    const cap = `Mình vừa "dám nói" tiếng Anh ${mmss} phút với Toki 🔥 ${errorCount} lần bị khịa sấp mặt mà vẫn sống 😎 Thử đi: Dám Nói app #DamNoi #hoctienganh`;
    try { navigator.clipboard.writeText(cap); } catch {}
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

  const transcriptRef = useRef("");
  const interimRef = useRef("");
  const holdingRef = useRef(false);

  const startHold = () => {
    if (!sttSupported) { setMicError("Trình duyệt này không hỗ trợ nhận giọng nói. Hãy dùng Chrome, hoặc gõ chữ bên dưới."); return; }
    if (loading || holdingRef.current) return;
    setMicError("");
    transcriptRef.current = "";
    holdingRef.current = true;
    try {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new SR();
      rec.lang = "en-US";
      rec.continuous = true;       // don't auto-stop on a pause
      rec.interimResults = true;   // keep capturing while held
      rec.maxAlternatives = 1;
      interimRef.current = "";
      rec.onstart = () => setListening(true);
      rec.onresult = (e) => {
        let finalText = "", interimText = "";
        for (let i = 0; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) finalText += t + " ";
          else interimText += t + " ";
        }
        // Browsers (esp. Chrome/Google) auto-"fix" grammar & punctuation in the
        // FINAL result — e.g. "it not good" becomes "It's not good" — which hides
        // the learner's real mistake. The INTERIM text is closer to what was
        // actually said, so we keep the latest interim as the raw fallback.
        if (interimText.trim()) interimRef.current = interimText.trim();
        if (finalText.trim()) transcriptRef.current = finalText.trim();
      };
      rec.onerror = (e) => {
        // While held, ignore the harmless "no-speech"/"aborted" so it doesn't cut off.
        if (holdingRef.current && (e.error === "no-speech" || e.error === "aborted")) return;
        setListening(false); setMicError(micErrMsg(e.error));
      };
      rec.onend = () => {
        // If still held (browser auto-ended anyway), restart to keep listening.
        if (holdingRef.current) { try { rec.start(); } catch {} return; }
        setListening(false);
      };
      recogRef.current = rec; rec.start();
    } catch { holdingRef.current = false; setListening(false); setMicError("Không khởi động được micro. Thử tải lại trang, hoặc gõ chữ bên dưới."); }
  };

  const endHold = () => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    setListening(false);
    try { recogRef.current?.stop(); } catch {}
    // small delay so the last result lands before we read it
    setTimeout(() => {
      // Prefer the RAW interim text (less auto-corrected by the browser). Fall back
      // to the final only if interim is empty. This keeps the learner's real words.
      const raw = (interimRef.current || transcriptRef.current || "").trim();
      transcriptRef.current = ""; interimRef.current = "";
      if (raw) handleSend(raw);
    }, 250);
  };

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const roastTopic = FUN_TOPICS.find((t) => t.id === "roast");
  const funTopicsNoRoast = FUN_TOPICS.filter((t) => t.id !== "roast");

  return (
    <div className="dn">
      <style>{STYLE}</style>
      <div className="wrap">
        <div className="phone">

          {screen === "welcome" && (
            <div className="welcome">
              <Toki size="lg" />
              <h1 className="disp">MoHo AI</h1>
              <p className="tag">Dare to speak</p>
              <p className="promise disp">"Cứ nói đại.<br/>Đừng sợ sai."</p>
              <button className="cta" onClick={() => setScreen(getJob() ? "home" : "job")}>Bắt đầu</button>
              <p className="fine">Toki nói tiếng Anh · bí từ cứ chêm tiếng Việt</p>
            </div>
          )}

          {screen === "job" && (
            <div className="welcome">
              <Toki size="md" />
              <h1 className="disp" style={{ fontSize: 30 }}>Bạn là ai nào?</h1>
              <p className="tag">Để Toki khịa cho đúng "gu" ngành của bạn 😎</p>
              <div className="jobgrid">
                {JOBS.map((j) => (
                  <button key={j.id} className="jobcard" onClick={() => { setJob(j.vi); setScreen("home"); }}>
                    <span className="jic">{j.icon}</span>
                    <span className="jvi">{j.vi}</span>
                  </button>
                ))}
              </div>
              <button className="skip" onClick={() => { setJob(""); setScreen("home"); }}>Bỏ qua</button>
            </div>
          )}

          {screen === "home" && (
            <>
              <div className="home-h">
                <div className="hi">Hôm nay muốn nói gì nào?</div>
                <h2 className="disp">Chào {account?.name ? account.name.split(" ").slice(-1)[0] : "ní"} 👋</h2>
                <div className="streakbar">
                  <button className="pill fire tap" onClick={openProgress}><Flame size={15} /> {streak} ngày</button>
                  <button className="pill book tap" onClick={openVocab}><BookOpen size={15} /> Sổ từ vựng</button>
                  <button className="pill min tap" onClick={openProgress}><TrendingUp size={15} /> Hành trình</button>
                  {account
                    ? <button className="pill min tap" onClick={doLogout} title={account.email}>Đăng xuất</button>
                    : <button className="pill save tap" onClick={doLogin}>🔒 Lưu tiến trình</button>}
                </div>
              </div>

              {/* Hot card: Bị Toki khịa — full width, bốc lửa */}
              {roastTopic && (
                <div className="hotwrap">
                  <button className="hotcard" onClick={() => openTopic(roastTopic)}>
                    <div className="hotglow" />
                    <div className="hotic">{roastTopic.icon}</div>
                    <div className="hottxt">
                      <div className="hotvi">{roastTopic.vi}</div>
                      <div className="hoten">{roastTopic.en} · {roastTopic.desc}</div>
                    </div>
                    <Flame size={20} className="hotflame" />
                  </button>
                </div>
              )}

              <div className="ask disp">Chọn một tình huống — hoặc cứ nói tự do</div>
              <div className="grid">
                {TOPICS.map((tp, i) => (
                  <button key={tp.id} className={`tcard ${tp.id === "free" ? "free" : ""}`} style={{ animationDelay: `${i * 40}ms` }} onClick={() => openTopic(tp)}>
                    <div className="ic" style={{ background: tp.id === "free" ? undefined : `${tp.hue}26`, color: tp.hue }}>
                      {tp.icon === "rabbit" ? <Rabbit size={22} color="#fff" /> : tp.icon}
                    </div>
                    <div className="vi">{tp.vi}</div>
                    <div className="en">{tp.en}</div>
                  </button>
                ))}
                <div className="section-head">🔥 Vui &amp; Viral</div>
                {funTopicsNoRoast.map((tp, i) => (
                  <button key={tp.id} className="tcard" style={{ animationDelay: `${i * 40}ms` }} onClick={() => openTopic(tp)}>
                    <div className="ic" style={{ background: `${tp.hue}26`, color: tp.hue }}>{tp.icon}</div>
                    <div className="vi">{tp.vi}</div>
                    <div className="en">{tp.en}</div>
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
                  <button className="tbtn rev" title="Xem lại" onClick={openReview}><Sparkles size={19} />{errorCount > 0 && <span className="badge">{errorCount}</span>}</button>
                  <button className="finb" onClick={finish}>Xong</button>
                </div>
              </div>

              <div className="feed" ref={feedRef}>
                {ui.map((m, i) => (
                  <React.Fragment key={i}>
                    {m.who === "scene" ? (
                      <div className="scene-div">{m.text}</div>
                    ) : m.who === "u" ? (
                      <div className="row u">
                        <div className="bub u">{m.text}</div>
                      </div>
                    ) : (
                      <div className="row t">
                        <div className="bub t">
                          {m.roast && <div className={`roast ${m.isFix ? "fix" : "hype"}`}>{m.roast}</div>}
                          {(m.en || m.text) && <div className={m.roast ? "enline" : undefined}>{m.en || m.text}</div>}
                        </div>
                        <div className="mtools">
                          <button className="mtb" onClick={() => speakSeq(m.roast, m.en || m.text)}><Play size={12} /> Nghe lại</button>
                          {m.vi && <button className={`mtb ${revealed[i] ? "on" : ""}`} onClick={() => setRevealed((r) => ({ ...r, [i]: !r[i] }))}><Languages size={12} /> {revealed[i] ? "Ẩn" : "Dịch"}</button>}
                        </div>
                        {revealed[i] && m.vi && <div className="vihint">{m.vi}</div>}
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
                {limitHit ? (
                  <div className="limitbox">
                    <div className="limitt">Hết lượt free hôm nay rồi 😏</div>
                    <div className="limitd">Mai quay lại khịa tiếp nha ní — hoặc bấm Xong để xem lại buổi hôm nay.</div>
                  </div>
                ) : !typing ? (
                  <>
                    <div className="microw">
                      <button className="kbtoggle" title="Gõ chữ (chế độ im lặng)" onClick={() => setTyping(true)}>
                        <Keyboard size={20} />
                      </button>
                      <button
                        className={`bigmic ${listening ? "on" : ""}`}
                        disabled={!sttSupported || loading}
                        title={sttSupported ? "Ấn giữ để phản xạ" : "Trình duyệt không hỗ trợ mic — bấm phím gõ chữ"}
                        onMouseDown={startHold}
                        onMouseUp={endHold}
                        onMouseLeave={() => { if (holdingRef.current) endHold(); }}
                        onTouchStart={(e) => { e.preventDefault(); startHold(); }}
                        onTouchEnd={(e) => { e.preventDefault(); endHold(); }}
                        onContextMenu={(e) => e.preventDefault()}
                      >
                        <Mic size={30} />
                      </button>
                      <div className="kbspacer" />
                    </div>
                    <div className="mhint" style={micError ? { color: "var(--coral)" } : undefined}>{micError ? micError : listening ? "Đang nghe… cứ nói thoải mái" : sttSupported ? "Ấn giữ để phản xạ — hoặc bấm ⌨ để gõ" : "Bấm phím ⌨ để gõ câu của bạn"}</div>
                  </>
                ) : (
                  <div className="typewrap">
                    <button className="kbback" title="Quay lại nói" onClick={() => setTyping(false)}><Mic size={18} /></button>
                    <input className="txt" value={input} autoFocus
                      placeholder="Đang ở chỗ đông người? Gõ vào đây…"
                      onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }} />
                    <button className="sendb" disabled={loading || !input.trim()} onClick={() => handleSend()}><Send size={17} /></button>
                  </div>
                )}
              </div>
            </>
          )}

          {screen === "finish" && (
            <div className="finish">
              {Array.from({ length: 14 }).map((_, i) => (
                <span key={i} className="confetti" style={{
                  left: `${(i * 7 + 4) % 100}%`,
                  background: [ "#12A974", "#FF6B45", "#FFAE2E", "#FF5E3A" ][i % 4],
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
                <div className="stat s"><div className="n">{errorCount}</div><div className="l">Cách nói mới</div></div>
              </div>
              <div className="streakbig"><Flame size={18} /> {streak} ngày liên tiếp — giữ lửa nhé!</div>
              <p className="praise disp">"Mỗi lần bạn dám mở miệng là một lần can đảm. Hẹn mai gặp lại?"</p>
              <div className="finbtns">
                <button className="pri" onClick={() => { setScreen("home"); }}>Hẹn mai gặp lại 🔥</button>
                <button className="share" onClick={openBrag}><Sparkles size={16} /> Khoe sổ phốt</button>
                <button className="sec" onClick={() => { setScreen("chat"); armSilence(); }}>Nói thêm chút nữa</button>
                {errorCount > 0 && <button className="sec" onClick={openReview}>Xem lại {errorCount} cách nói mới</button>}
              </div>
            </div>
          )}

          {showReview && (
            <div className="drawer" onClick={() => setShowReview(false)}>
              <div className="sheet" onClick={(e) => e.stopPropagation()}>
                <button className="closeb" onClick={() => setShowReview(false)}><X size={18} /></button>
                <h3 className="disp"><Sparkles size={20} color="#FF5E3A" /> Xem lại nhẹ nhàng</h3>
                <p className="lead">Bạn đã nói rất tốt. Đây là vài cách nói còn tự nhiên hơn — chỉ để tham khảo thôi nhé, không phải lỗi.</p>
                {errors.length === 0 ? (
                  <div className="empty">Chưa có gì để xem lại.<br/>Cứ thoải mái nói tiếp đi nhé!</div>
                ) : errors.map((e, i) => (
                  <div className="err" key={i}><div className="said">{e.said}</div><div className="nat">{e.natural}</div></div>
                ))}
              </div>
            </div>
          )}

          {showVocab && (
            <div className="drawer" onClick={() => setShowVocab(false)}>
              <div className="sheet" onClick={(e) => e.stopPropagation()}>
                <button className="closeb" onClick={() => setShowVocab(false)}><X size={18} /></button>
                <h3 className="disp"><BookOpen size={20} color="#FF5E3A" /> Sổ từ vựng</h3>
                <p className="lead">Những từ và cụm Toki nhặt ra trong lúc bạn nói. Học lại bất cứ lúc nào.</p>
                {vocabItems.length === 0 ? (
                  <div className="empty">Sổ từ vựng còn trống.<br/>Nói chuyện với Toki để gom từ mới nhé!</div>
                ) : vocabItems.map((v, i) => (
                  <div className="vocab" key={i}>
                    <div className="vw">{v.word}</div>
                    {v.meaning_vi ? <div className="vm">{v.meaning_vi}</div> : null}
                    {v.example_en ? <div className="ve">“{v.example_en}”</div> : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          {showProgress && (
            <div className="drawer" onClick={() => setShowProgress(false)}>
              <div className="sheet" onClick={(e) => e.stopPropagation()}>
                <button className="closeb" onClick={() => setShowProgress(false)}><X size={18} /></button>
                <h3 className="disp"><TrendingUp size={20} color="#FF5E3A" /> Hành trình của bạn</h3>
                <p className="lead">Mỗi lần bạn dám mở miệng đều được tính. Đây là chặng đường tới giờ.</p>
                {!progress ? (
                  <div className="empty">Chưa có dữ liệu.<br/>Nói buổi đầu tiên để bắt đầu hành trình nhé!</div>
                ) : (
                  <div className="pgrid">
                    <div className="pstat"><div className="pn">{progress.streakDays}</div><div className="pl">Ngày liên tiếp</div></div>
                    <div className="pstat"><div className="pn">{progress.totalSessions}</div><div className="pl">Buổi đã nói</div></div>
                    <div className="pstat"><div className="pn">{Math.round((progress.totalSeconds || 0) / 60)}</div><div className="pl">Phút đã nói</div></div>
                    <div className="pstat"><div className="pn">{progress.totalWords}</div><div className="pl">Từ đã nói</div></div>
                    <div className="pstat"><div className="pn">{progress.correctionsLearned}</div><div className="pl">Lần được sửa</div></div>
                    <div className="pstat"><div className="pn">{progress.vocabSaved}</div><div className="pl">Từ đã lưu</div></div>
                  </div>
                )}
              </div>
            </div>
          )}

          {showBrag && (
            <div className="drawer" onClick={() => setShowBrag(false)}>
              <div className="sheet" onClick={(e) => e.stopPropagation()}>
                <button className="closeb" onClick={() => setShowBrag(false)}><X size={18} /></button>
                <h3 className="disp"><Sparkles size={20} color="#FF6B45" /> Sổ phốt của bạn</h3>
                <p className="lead">Chụp màn hình tấm thẻ này rồi flex lên TikTok / Story nhé! 😎</p>
                <div className="bragcard">
                  <div className="bragtop">
                    <Toki size="sm" />
                    <div>
                      <div className="bragname">Sổ phốt tiếng Anh</div>
                      <div className="bragsub">by MoHo AI 🔥</div>
                    </div>
                  </div>
                  <div className="bragstats">
                    <div><b>{mmss}</b><span>phút nói</span></div>
                    <div><b>{words}</b><span>từ</span></div>
                    <div><b>{errorCount}</b><span>lần bị khịa</span></div>
                  </div>
                  {errors.length > 0 && (
                    <div className="braglist">
                      {errors.slice(0, 3).map((e, i) => (
                        <div className="bragerr" key={i}><s>{e.said}</s> → <b>{e.natural}</b></div>
                      ))}
                    </div>
                  )}
                  <div className="bragfoot">"Nói sai cũng được, miễn là DÁM NÓI" 💪</div>
                </div>
                <button className="pri" style={{ marginTop: 16, width: "100%" }} onClick={copyBrag}>Sao chép caption khoe 📋</button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
