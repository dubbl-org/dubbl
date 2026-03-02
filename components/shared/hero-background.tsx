"use client";

import { motion } from "motion/react";

function VerticalLines() {
  const positions = [
    "left-[16.666%]",
    "left-[33.333%]",
    "left-[50%]",
    "left-[66.666%]",
    "left-[83.333%]",
  ];

  return (
    <>
      {positions.map((pos, i) => (
        <div
          key={i}
          className={`absolute top-0 bottom-0 ${pos} w-px`}
        >
          <div className="h-full w-full bg-gradient-to-b from-transparent via-gray-200/40 to-transparent" />
          {/* Cross marks at intervals */}
          {[20, 40, 60, 80].map((top) => (
            <div
              key={top}
              className="absolute left-1/2 -translate-x-1/2"
              style={{ top: `${top}%` }}
            >
              <div className="h-px w-2 bg-gray-300/30" />
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

function HorizontalLines() {
  return (
    <>
      <div className="absolute top-[30%] right-0 left-0 h-px">
        <div className="h-full w-full bg-gradient-to-r from-transparent via-gray-200/30 to-transparent" />
      </div>
      <div className="absolute top-[70%] right-0 left-0 h-px">
        <div className="h-full w-full bg-gradient-to-r from-transparent via-gray-200/30 to-transparent" />
      </div>
    </>
  );
}

function RadialGlows() {
  return (
    <>
      <motion.div
        className="absolute top-[10%] left-[20%] h-[300px] w-[300px] rounded-full bg-emerald-400/[0.06] blur-[140px]"
        animate={{ opacity: [0.4, 0.7, 0.4], scale: [1, 1.05, 1] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-[40%] right-[15%] h-[250px] w-[250px] rounded-full bg-emerald-300/[0.05] blur-[140px]"
        animate={{ opacity: [0.3, 0.6, 0.3], scale: [1, 1.08, 1] }}
        transition={{
          duration: 7,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2,
        }}
      />
      <motion.div
        className="absolute bottom-[20%] left-[40%] h-[200px] w-[200px] rounded-full bg-teal-400/[0.04] blur-[140px]"
        animate={{ opacity: [0.3, 0.5, 0.3], scale: [1, 1.06, 1] }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 4,
        }}
      />
    </>
  );
}

function AnimatedBeams() {
  const beams = [
    { left: "10%", delay: 0, duration: 8 },
    { left: "35%", delay: 3, duration: 10 },
    { left: "60%", delay: 6, duration: 9 },
    { left: "85%", delay: 1.5, duration: 11 },
  ];

  return (
    <>
      {beams.map((beam, i) => (
        <motion.div
          key={i}
          className="absolute h-[200px] w-px"
          style={{ left: beam.left, top: "-200px" }}
          animate={{
            top: ["- 200px", "120%"],
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: beam.duration,
            repeat: Infinity,
            delay: beam.delay,
            ease: "linear",
          }}
        >
          <div className="h-full w-full bg-gradient-to-b from-transparent via-emerald-400/20 to-transparent" />
        </motion.div>
      ))}
    </>
  );
}

export function HeroBackground() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{
        maskImage:
          "radial-gradient(ellipse 70% 60% at 50% 40%, black 40%, transparent 100%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 70% 60% at 50% 40%, black 40%, transparent 100%)",
      }}
    >
      <VerticalLines />
      <HorizontalLines />
      <RadialGlows />
      <AnimatedBeams />
    </div>
  );
}
