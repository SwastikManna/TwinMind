'use client'

import { motion } from 'framer-motion'

interface AvatarPreviewProps {
  expression?: 'neutral' | 'happy' | 'thinking' | 'speaking'
  headColor?: string
  bodyColor?: string
  size?: 'sm' | 'md' | 'lg'
}

export function AvatarPreview({
  expression = 'neutral',
  headColor = '#0d9488',
  bodyColor = '#0f766e',
  size = 'lg',
}: AvatarPreviewProps) {
  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-24 h-24',
    lg: 'w-72 h-72',
  }

  const eyeVariants = {
    neutral: { scaleY: 1 },
    happy: { scaleY: 0.5 },
    thinking: { scaleY: 1, x: 5 },
    speaking: { scaleY: 1 },
  }

  const mouthVariants = {
    neutral: { d: 'M 35 55 Q 50 60 65 55' },
    happy: { d: 'M 35 52 Q 50 65 65 52' },
    thinking: { d: 'M 40 55 Q 50 55 60 55' },
    speaking: { d: 'M 35 52 Q 50 62 65 52' },
  }

  return (
    <div className={`${sizeClasses[size]} relative flex items-center justify-center`}>
      <motion.svg
        viewBox="0 0 100 100"
        className="w-full h-full"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        {/* Glow effect */}
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="headGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={headColor} />
            <stop offset="100%" stopColor={bodyColor} />
          </linearGradient>
        </defs>

        {/* Body/Neck */}
        <motion.ellipse
          cx="50"
          cy="90"
          rx="25"
          ry="15"
          fill={bodyColor}
          initial={{ y: 10 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        />

        {/* Head */}
        <motion.circle
          cx="50"
          cy="45"
          r="30"
          fill="url(#headGradient)"
          filter="url(#glow)"
          animate={{
            y: expression === 'thinking' ? [-2, 2, -2] : 0,
          }}
          transition={{
            duration: 2,
            repeat: expression === 'thinking' ? Infinity : 0,
            ease: 'easeInOut',
          }}
        />

        {/* Left Eye */}
        <motion.ellipse
          cx="40"
          cy="42"
          rx="4"
          ry="5"
          fill="white"
          variants={eyeVariants}
          animate={expression}
          transition={{ duration: 0.3 }}
        />
        <motion.circle cx="41" cy="43" r="2" fill="#1e293b" />

        {/* Right Eye */}
        <motion.ellipse
          cx="60"
          cy="42"
          rx="4"
          ry="5"
          fill="white"
          variants={eyeVariants}
          animate={expression}
          transition={{ duration: 0.3 }}
        />
        <motion.circle cx="61" cy="43" r="2" fill="#1e293b" />

        {/* Mouth */}
        <motion.path
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          initial={{ d: 'M 35 55 Q 50 60 65 55' }}
          animate={mouthVariants[expression]}
          transition={{ duration: 0.3 }}
        />

        {/* Blush */}
        {expression === 'happy' && (
          <>
            <motion.circle
              cx="32"
              cy="50"
              r="4"
              fill="#fda4af"
              opacity="0.5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
            />
            <motion.circle
              cx="68"
              cy="50"
              r="4"
              fill="#fda4af"
              opacity="0.5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
            />
          </>
        )}

        {/* Thinking dots */}
        {expression === 'thinking' && (
          <>
            <motion.circle
              cx="75"
              cy="25"
              r="3"
              fill={headColor}
              opacity="0.6"
              animate={{ y: [-2, 2, -2] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0 }}
            />
            <motion.circle
              cx="82"
              cy="18"
              r="2"
              fill={headColor}
              opacity="0.4"
              animate={{ y: [-2, 2, -2] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
            />
            <motion.circle
              cx="87"
              cy="12"
              r="1.5"
              fill={headColor}
              opacity="0.3"
              animate={{ y: [-2, 2, -2] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
            />
          </>
        )}

        {/* Speaking animation */}
        {expression === 'speaking' && (
          <motion.ellipse
            cx="50"
            cy="57"
            rx="8"
            ry="4"
            fill="white"
            opacity="0.8"
            animate={{ ry: [4, 6, 3, 5, 4] }}
            transition={{ duration: 0.5, repeat: Infinity }}
          />
        )}
      </motion.svg>
    </div>
  )
}
