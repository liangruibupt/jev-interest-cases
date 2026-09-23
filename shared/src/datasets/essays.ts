/** Synthetic 8th-grade science answers for C1. Fictional students; hand-labelled expected levels for smoke checks. */
export type RubricId = "cause_scattering" | "sunset_path" | "names_rayleigh" | "evidence_or_example";
export type MisconceptionId = "none" | "reflects_ocean" | "air_is_blue" | "refraction_not_scattering" | "other_misconception";

export interface Essay {
  id: string;
  student: string;
  text: string;
  /** Acceptable overall levels 0–3 (first = primary), plus flags the smoke checks for. */
  expected: { levels: number[]; misconception?: MisconceptionId; offTopic?: boolean; lengthFlag?: "too_short" | "too_long" };
  note_zh: string;
}

export const ASSIGNMENT = {
  grade: "8th grade science",
  prompt:
    "Why does the sky look blue during the day but orange or red at sunset? Write 4 to 6 sentences. Name the process responsible and give one piece of evidence or an example that supports your explanation.",
  rubric: [
    { id: "cause_scattering" as RubricId, title_zh: "说出原因：大气散射短波（蓝光）", points: 1 },
    { id: "sunset_path" as RubricId, title_zh: "解释日落：光程更长，蓝光被散射掉", points: 1 },
    { id: "names_rayleigh" as RubricId, title_zh: "说出过程名：Rayleigh scattering", points: 1 },
    { id: "evidence_or_example" as RubricId, title_zh: "给出证据或例子", points: 1 },
  ],
  levels_zh: ["离题、空白或基本错误", "点到现象但解释缺关键部分或有错误", "解释正确，有小缺口（无证据或无术语）", "完整准确：原因、日落、术语、证据"],
};

export const ESSAYS: Essay[] = [
  {
    id: "E01", student: "Amara O.",
    text: "Sunlight contains all colors, and when it enters the atmosphere the tiny gas molecules scatter the shorter blue wavelengths much more than the longer red ones, so blue light reaches our eyes from every direction. This is called Rayleigh scattering. At sunset the light has to travel through much more air to reach us, so most of the blue is scattered away before it arrives and the remaining light looks orange and red. One piece of evidence is that the Sun itself looks slightly yellow rather than white, because some of its blue light has been scattered out of the direct beam. Another is that on Mars, where the dust scatters differently, the daytime sky looks butterscotch instead of blue.",
    expected: { levels: [3] }, note_zh: "满分样本：原因、日落、术语、两条证据",
  },
  {
    id: "E02", student: "Ben K.",
    text: "The sky is blue because the air scatters blue light more than the other colors in sunlight. Blue light has a shorter wavelength, so it bounces off the gas molecules and spreads across the whole sky. At sunset the sunlight passes through a much thicker slice of atmosphere, so the blue gets scattered out along the way and the reds and oranges are what is left. You can see the same idea when the Sun looks yellowish instead of pure white at noon.",
    expected: { levels: [2] }, note_zh: "内容正确、有证据，但没说出 Rayleigh 这个名字",
  },
  {
    id: "E03", student: "Chloe D.",
    text: "Blue light has a short wavelength, so the molecules in the air scatter it in all directions and the whole sky glows blue. The name of this process is Raleigh scattering. When the Sun is low at sunset, its light crosses far more atmosphere, and by the time it reaches us the blue has been scattered away, leaving orange and red. Evidence: a glass of water with a little milk in it looks bluish from the side and orange when you look through it at a light, just like the sky and the sunset.",
    expected: { levels: [3, 2] }, note_zh: "术语拼错（Raleigh）——看 Jev 是否按字面判",
  },
  {
    id: "E04", student: "Diego R.",
    text: "The sky is blue because it reflects the color of the oceans and lakes below it. Water is blue, and there is a lot of it on Earth, so the sky picks up that color during the day. At sunset the sun is going down so the light gets dimmer and turns orange like a fire does when it is dying out. My evidence is that when you are at the beach the sky looks even bluer than in the city.",
    expected: { levels: [0, 1], misconception: "reflects_ocean" }, note_zh: "经典错误概念：天空反射海洋",
  },
  {
    id: "E05", student: "Emma L.",
    text: "Air is made mostly of nitrogen and oxygen, and those gases are naturally a very light blue color, so when there is a lot of air above you it looks blue, the same way a thin piece of blue glass looks darker when you stack many pieces. At sunset the light comes in sideways through the pollution and dust near the ground, which makes it look orange. For example the sunsets in big cities are more orange than in the countryside.",
    expected: { levels: [0, 1], misconception: "air_is_blue" }, note_zh: "错误概念：气体本身是蓝色的",
  },
  {
    id: "E06", student: "Farah S.",
    text: "The ocean looks blue because water absorbs the red and yellow parts of sunlight and reflects the blue part back to our eyes. Deeper water looks darker blue because more light is absorbed before it comes back. Near the shore the water can look green or brown because of sand and algae. That is why the sea is many different colors in different places.",
    expected: { levels: [0], offTopic: true }, note_zh: "离题：写的是海洋为什么是蓝的",
  },
  {
    id: "E07", student: "Gabriel M.",
    text: "Because of scattering of blue light.",
    expected: { levels: [1, 0], lengthFlag: "too_short" }, note_zh: "只有一句：句数由代码判定为过短",
  },
  {
    id: "E08", student: "Hana T.",
    text: "So first of all I want to say that this is a really interesting question and I have wondered about it since I was little. My grandmother used to tell me the sky was blue because it was happy but I know now that is not the scientific reason. The real reason is that sunlight is made of all the colors and when it passes through the air the small molecules scatter the blue light more than the other colors because blue has a shorter wavelength. Scientists call this Rayleigh scattering after a scientist named Lord Rayleigh. Then at sunset the Sun is low and the light goes through a lot more air, and the blue gets scattered away before it gets to us so we see red and orange. I also read that this is why the Sun looks a bit yellow instead of white in the middle of the day. Also astronauts say that from space the sky is black because there is no air to scatter the light. So that is my answer and I think it is very cool that light can do this. Thank you for reading.",
    expected: { levels: [3, 2], lengthFlag: "too_long" }, note_zh: "内容完整但十句以上：内容与篇幅分开判",
  },
  {
    id: "E09", student: "Isaac P.",
    text: "The question is asking why the sky looks blue during the day but orange or red at sunset. It wants us to name the process responsible and give one piece of evidence or an example. The sky changes color at different times of day. During the day it is blue and at sunset it is orange or red, which is a very beautiful thing to see.",
    expected: { levels: [0] }, note_zh: "复述题目，没有回答",
  },
  {
    id: "E10", student: "Julia F.",
    text: "During the day the gas molecules in the air scatter blue light more than red light because blue has a shorter wavelength, and that scattered blue light fills the sky. This is known as Rayleigh scattering. At sunset the Sun gets closer to the Earth and heats up, which is why the light turns a hot orange and red color. A good example is that the sky in photos from airplanes is a deeper blue because there is less air above the plane.",
    expected: { levels: [1, 2], misconception: "other_misconception" }, note_zh: "原因正确，日落解释错误（太阳变近变热）",
  },
  {
    id: "E11", student: "Kai W.",
    text: "The atmosphere works like a giant prism. When white sunlight enters the air it is refracted, and the blue part of the light is bent the most, so it spreads out across the sky and makes it look blue. At sunset the light comes in at a low angle and is bent even more, so the blue is bent away and we see the red and orange end of the spectrum. You can see the same effect with a real prism, which splits white light into a rainbow.",
    expected: { levels: [1], misconception: "refraction_not_scattering" }, note_zh: "把散射说成折射（棱镜）",
  },
  {
    id: "E12", student: "Lin Z.",
    text: "Sky is blue because the air molecule scatter the blue light more than red light, blue light have shorter wavelength so it scatter more. This process name is Rayleigh scattering. In the sunset the sunlight need go through more atmosphere, blue light already scatter away so only red and orange light can reach our eye. Evidence is the moon have no atmosphere so the sky in the moon is black even in daytime, because no molecule to scatter the light.",
    expected: { levels: [3] }, note_zh: "语法有误但科学内容完整：清晰度与内容分开打分",
  },
];
