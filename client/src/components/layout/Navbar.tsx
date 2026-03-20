import { AnimatePresence, motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { APP_NAME, PRIMARY_NAV_ITEMS } from '../../lib/constants';
import { buttonClassName } from '../ui/button';

export const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 16);

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      <header className={`topbar ${isScrolled ? 'topbar--active' : ''}`}>
        <Link to="/" className="topbar__brand">
          <span className="topbar__brand-dot" />
          {APP_NAME}
        </Link>
        <nav className="topbar__links">
          {PRIMARY_NAV_ITEMS.map((item) => (
            <a key={item.label} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="topbar__actions">
          <Link to="/login" className="topbar__plain-link">
            Login
          </Link>
          <Link
            className={buttonClassName('primary', 'md', 'topbar__cta')}
            to="/signup"
          >
            Get Started Free
          </Link>
          <button
            className="topbar__menu-button"
            onClick={() => setIsOpen((value) => !value)}
            aria-label="Toggle navigation menu"
            type="button"
          >
            {isOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </header>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            className="mobile-sheet"
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mobile-sheet__inner">
              <div className="mobile-sheet__header">
                <span>{APP_NAME}</span>
                <button
                  className="topbar__menu-button"
                  type="button"
                  onClick={() => setIsOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <nav className="mobile-sheet__nav">
                {PRIMARY_NAV_ITEMS.map((item, index) => (
                  <motion.a
                    key={item.label}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 12 }}
                    transition={{ delay: 0.04 * index }}
                  >
                    {item.label}
                  </motion.a>
                ))}
              </nav>
              <div className="mobile-sheet__footer">
                <Link to="/login" onClick={() => setIsOpen(false)}>
                  Login
                </Link>
                <Link to="/signup" onClick={() => setIsOpen(false)}>
                  Get Started Free
                </Link>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
};
