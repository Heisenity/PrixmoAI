import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

export const LoadingSpinner = ({
  label = 'Generating',
  className,
}: {
  label?: string;
  className?: string;
}) => (
  <div className={cn('loading-orbit', className)}>
    <motion.div
      className="loading-orbit__accretion"
      animate={{ rotate: 360 }}
      transition={{ duration: 5.4, ease: 'linear', repeat: Number.POSITIVE_INFINITY }}
    />
    <motion.div
      className="loading-orbit__ring"
      animate={{ rotate: 360 }}
      transition={{ duration: 4, ease: 'linear', repeat: Number.POSITIVE_INFINITY }}
    />
    <motion.div
      className="loading-orbit__core"
      animate={{ scale: [0.92, 1.05, 0.92], opacity: [0.72, 1, 0.72] }}
      transition={{ duration: 2.2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
    />
    <motion.div
      className="loading-orbit__pulse"
      animate={{ scale: [0.9, 1.35], opacity: [0.5, 0] }}
      transition={{ duration: 1.8, repeat: Number.POSITIVE_INFINITY, ease: 'easeOut' }}
    />
    <motion.span
      className="loading-orbit__particle loading-orbit__particle--1"
      animate={{ rotate: 360 }}
      transition={{ duration: 3.8, ease: 'linear', repeat: Number.POSITIVE_INFINITY }}
    />
    <motion.span
      className="loading-orbit__particle loading-orbit__particle--2"
      animate={{ rotate: -360 }}
      transition={{ duration: 4.8, ease: 'linear', repeat: Number.POSITIVE_INFINITY }}
    />
    <span className="loading-orbit__label">{label}</span>
  </div>
);
