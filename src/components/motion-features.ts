import { domMax } from 'framer-motion';

/**
 * Framer Motion's feature set, in its own module so MotionProvider can load
 * it with a dynamic import — a static `domMax` import puts the whole feature
 * set into every route's first load, which is what LazyMotion exists to avoid
 * (plan §5.6, PERF-01).
 */
export default domMax;
