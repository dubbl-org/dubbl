"use client";

import { motion } from "motion/react";

const BEAM_POSITIONS = [
  { left: "10%", delay: 0, duration: 6 },
  { left: "30%", delay: 2.5, duration: 7 },
  { left: "50%", delay: 1, duration: 5.5 },
  { left: "70%", delay: 3.5, duration: 6.5 },
  { left: "90%", delay: 5, duration: 7.5 },
];

function AnimatedBeams() {
  return (
    <>
      {BEAM_POSITIONS.map((beam, i) => (
        <motion.div
          key={i}
          className="absolute w-px"
          style={{
            left: beam.left,
            height: "180px",
          }}
          initial={{ top: "-180px", opacity: 0 }}
          animate={{
            top: ["-180px", "110%"],
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: beam.duration,
            repeat: Infinity,
            delay: beam.delay,
            ease: "linear",
          }}
        >
          <div className="h-full w-full bg-gradient-to-b from-transparent via-emerald-400/30 to-transparent shadow-[0_0_8px_1px_rgba(52,211,153,0.2)]" />
        </motion.div>
      ))}
    </>
  );
}

function RadialGlows() {
  return (
    <>
      <motion.div
        className="absolute top-[15%] left-[25%] h-[350px] w-[350px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/[0.05] blur-[120px]"
        animate={{ opacity: [0.3, 0.6, 0.3], scale: [0.95, 1.05, 0.95] }}
        transition={{
          duration: 7,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <motion.div
        className="absolute top-[55%] right-[20%] h-[280px] w-[280px] -translate-y-1/2 translate-x-1/2 rounded-full bg-teal-500/[0.04] blur-[120px]"
        animate={{ opacity: [0.2, 0.5, 0.2], scale: [1, 1.1, 1] }}
        transition={{
          duration: 9,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 3,
        }}
      />
    </>
  );
}

export function HeroBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <AnimatedBeams />
      <RadialGlows />
    </div>
  );
}
