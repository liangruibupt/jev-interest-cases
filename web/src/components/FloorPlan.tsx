import { ROOMS, ROOM_LABELS_ZH, type Brightness, type HomeState, type LightColor, type RoomId } from "@jev/shared";

const LIGHT_HEX: Record<LightColor, string> = { white: "#efe7d2", warm_white: "#f2b95a", red: "#e34948", blue: "#2a78d6", green: "#1baf7a", purple: "#7a4de0" };
const BRIGHTNESS_OPACITY: Record<Brightness, number> = { off: 0, dim: 0.45, medium: 0.75, bright: 1 };

const LAYOUT: Record<RoomId, { x: number; y: number; w: number; h: number }> = {
  living_room: { x: 0, y: 0, w: 250, h: 180 },
  kitchen: { x: 250, y: 0, w: 180, h: 180 },
  bedroom: { x: 430, y: 0, w: 190, h: 180 },
  bathroom: { x: 0, y: 180, w: 190, h: 170 },
  office: { x: 190, y: 180, w: 240, h: 170 },
};
const DOOR = { x: 430, y: 180, w: 190, h: 170 };

/** SVG floor plan: bulb colour/opacity = light state, thermostat number, blinds stripes, speaker note, TV screen, door lock. */
export function FloorPlan({ home, changed }: { home: HomeState; changed?: Set<string> }) {
  return (
    <svg viewBox="0 0 620 350" className="w-full" role="img" aria-label="房屋平面图">
      {ROOMS.map((id) => {
        const r = LAYOUT[id];
        const s = home.rooms[id];
        const lit = s.lights.on && s.lights.brightness !== "off";
        const glow = LIGHT_HEX[s.lights.color];
        const hot = changed?.has(id);
        return (
          <g key={id}>
            <rect x={r.x + 2} y={r.y + 2} width={r.w - 4} height={r.h - 4} rx={8} fill={lit ? glow : "#fffdf9"} fillOpacity={lit ? 0.16 * BRIGHTNESS_OPACITY[s.lights.brightness] + 0.04 : 1} stroke={hot ? "#1d4fd8" : "#d9d2c5"} strokeWidth={hot ? 2 : 1} className="transition-all duration-500" />
            <text x={r.x + 12} y={r.y + 22} fontSize={13} fill="#3f3a33" fontFamily="IBM Plex Sans, sans-serif">
              {ROOM_LABELS_ZH[id]}
            </text>
            {/* bulb */}
            <g transform={`translate(${r.x + 34}, ${r.y + 62})`}>
              {lit && <circle r={22} fill={glow} fillOpacity={0.35 * BRIGHTNESS_OPACITY[s.lights.brightness]} className="transition-all duration-500" />}
              <circle r={11} fill={lit ? glow : "#f5f1ea"} fillOpacity={lit ? Math.max(0.5, BRIGHTNESS_OPACITY[s.lights.brightness]) : 1} stroke="#8a857c" strokeWidth={1} className="transition-all duration-500" />
              <rect x={-4} y={11} width={8} height={5} rx={1} fill="#8a857c" />
            </g>
            {/* thermostat */}
            <text x={r.x + r.w - 12} y={r.y + 24} fontSize={14} textAnchor="end" fill="#c2650f" fontFamily="IBM Plex Mono, monospace">
              {s.thermostat.targetC}°C
            </text>
            {/* blinds (window) */}
            <g transform={`translate(${r.x + r.w - 58}, ${r.y + 40})`}>
              <rect width={46} height={30} rx={2} fill={s.blinds.open ? "#dff0ff" : "#f5f1ea"} stroke="#8a857c" />
              {s.blinds.open ? (
                <line x1={0} y1={6} x2={46} y2={6} stroke="#8a857c" strokeWidth={2} />
              ) : (
                [6, 12, 18, 24].map((y) => <line key={y} x1={2} y1={y} x2={44} y2={y} stroke="#8a857c" strokeWidth={1.5} />)
              )}
            </g>
            {/* speaker */}
            <g transform={`translate(${r.x + 16}, ${r.y + r.h - 46})`}>
              <rect width={22} height={30} rx={3} fill={s.speaker.playing ? "#1d4fd8" : "#fffdf9"} stroke="#8a857c" />
              <circle cx={11} cy={19} r={5} fill={s.speaker.playing ? "#fffdf9" : "#e6e0d4"} />
              {s.speaker.playing && (
                <text x={28} y={16} fontSize={14} fill="#1d4fd8">
                  ♪ {s.speaker.volume}
                </text>
              )}
            </g>
            {/* tv */}
            <g transform={`translate(${r.x + r.w - 70}, ${r.y + r.h - 44})`}>
              <rect width={56} height={30} rx={2} fill={s.tv.on ? "#1f1b16" : "#fffdf9"} stroke="#8a857c" />
              {s.tv.on && <rect x={5} y={5} width={46} height={20} fill="#2a78d6" fillOpacity={0.7} />}
              <rect x={22} y={30} width={12} height={4} fill="#8a857c" />
            </g>
          </g>
        );
      })}
      {/* entrance */}
      <g>
        <rect x={DOOR.x + 2} y={DOOR.y + 2} width={DOOR.w - 4} height={DOOR.h - 4} rx={8} fill="#f5f1ea" stroke={changed?.has("front_door_lock") ? "#1d4fd8" : "#d9d2c5"} strokeWidth={changed?.has("front_door_lock") ? 2 : 1} />
        <text x={DOOR.x + 12} y={DOOR.y + 22} fontSize={13} fill="#3f3a33" fontFamily="IBM Plex Sans, sans-serif">
          前门
        </text>
        <g transform={`translate(${DOOR.x + DOOR.w / 2}, ${DOOR.y + 70})`}>
          <rect x={-18} y={4} width={36} height={30} rx={4} fill={home.front_door_lock.locked ? "#1baf7a" : "#e34948"} />
          <path d={home.front_door_lock.locked ? "M -11 4 V -8 A 11 11 0 0 1 11 -8 V 4" : "M -11 4 V -8 A 11 11 0 0 1 11 -8 V -2"} fill="none" stroke="#3f3a33" strokeWidth={4} transform={home.front_door_lock.locked ? undefined : "translate(10,0)"} />
          <circle cy={19} r={4} fill="#fffdf9" />
        </g>
        <text x={DOOR.x + DOOR.w / 2} y={DOOR.y + 130} fontSize={13} textAnchor="middle" fill={home.front_door_lock.locked ? "#1baf7a" : "#e34948"} fontFamily="IBM Plex Sans, sans-serif">
          {home.front_door_lock.locked ? "已上锁" : "未上锁"}
        </text>
      </g>
    </svg>
  );
}
