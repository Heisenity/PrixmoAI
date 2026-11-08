import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { APP_NAME, PRIMARY_NAV_ITEMS } from '../../lib/constants';
import { isSuperAdminUser } from '../../lib/superAdmin';
import { buttonClassName } from '../ui/button';

export const Navbar = () => {
  const { session, signOut, user } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const showSuperAdminBadge = isSuperAdminUser(user);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 30);

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

  const springTransition = {
    type: 'spring' as const,
    stiffness: 340,
    damping: 30,
    mass: 0.8,
  };

  const authItem = (
    <motion.div
      layoutId="topbar-auth-item"
      transition={springTransition}
      className="topbar__login-wrap"
    >
      {session ? (
        <Link to="/app/generate" className="topbar__plain-link">
          Workspace
        </Link>
      ) : (
        <Link to="/login" className="topbar__plain-link">
          Login
        </Link>
      )}
    </motion.div>
  );

  return (
    <>
      <header
        className={`topbar ${isScrolled ? 'topbar--divided' : 'topbar--merged'}`}
      >
        <LayoutGroup id="topbar-nav">
          {/* PILL 1: Logo Pill (Left) */}
          <motion.div
            layout
            transition={springTransition}
            className="topbar-pill topbar-pill--brand"
          >
            <Link to="/" className="topbar__brand">
              <span className="topbar__brand-dot" />
              {APP_NAME}
            </Link>
          </motion.div>

          {/* PILL 2: Center Long Pill (Features, Pricing, How it Works + Login when scrolled) */}
          <motion.nav
            layout
            transition={springTransition}
            className="topbar-pill topbar-pill--nav"
          >
            {PRIMARY_NAV_ITEMS.map((item) => (
              <a key={item.label} href={item.href} className="topbar__nav-link">
                {item.label}
              </a>
            ))}

            {isScrolled ? authItem : null}
          </motion.nav>

          {/* PILL 3: Right CTA Pill (Get Started Free / Actions) */}
          <motion.div
            layout
            transition={springTransition}
            className="topbar-pill topbar-pill--actions"
          >
            {!isScrolled ? authItem : null}

            {session ? (
              <>
                {showSuperAdminBadge ? (
                  <span className="super-admin-chip super-admin-chip--topbar">
                    SA
                  </span>
                ) : null}
                <button
                  type="button"
                  className={buttonClassName('secondary', 'sm', 'topbar__cta')}
                  onClick={() => {
                    void signOut();
                  }}
                >
                  Log out
                </button>
              </>
            ) : (
              <Link
                className={buttonClassName('primary', 'sm', 'topbar__cta')}
                to="/signup"
              >
                Get Started Free
              </Link>
            )}

            <button
              className="topbar__menu-button"
              onClick={() => setIsOpen((value) => !value)}
              aria-label="Toggle navigation menu"
              type="button"
            >
              {isOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
          </motion.div>
        </LayoutGroup>
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
                {session ? (
                  <>
                    <Link to="/app/generate" onClick={() => setIsOpen(false)}>
                      Workspace
                    </Link>
                    <button
                      type="button"
                      className="mobile-sheet__footer-button"
                      onClick={() => {
                        setIsOpen(false);
                        void signOut();
                      }}
                    >
                      Log out
                    </button>
                  </>
                ) : (
                  <>
                    <Link to="/login" onClick={() => setIsOpen(false)}>
                      Login
                    </Link>
                    <Link to="/signup" onClick={() => setIsOpen(false)}>
                      Get Started Free
                    </Link>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
};
