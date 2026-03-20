import { Link } from 'react-router-dom';
import { APP_NAME } from '../../lib/constants';

const footerGroups = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'How it Works', href: '#how-it-works' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About Us', href: '#final-cta' },
      { label: 'Contact', href: 'mailto:hello@prixmoai.com' },
      { label: 'Refund Policy', href: '#pricing' },
    ],
  },
  {
    title: 'Support',
    links: [
      { label: 'Help Center', href: 'mailto:support@prixmoai.com' },
      { label: 'Privacy Policy', href: '#faq' },
      { label: 'Terms of Service', href: '#faq' },
    ],
  },
] as const;

const socialLinks = [
  { label: 'Instagram', href: 'https://instagram.com' },
  { label: 'LinkedIn', href: 'https://linkedin.com' },
  
  { label: 'Twitter', href: 'https://x.com' },
] as const;

export const Footer = () => (
  <footer className="site-footer">
    <div className="site-footer__panel">
      <div className="site-footer__grid">
        <div className="site-footer__brand">
          <Link to="/" className="site-footer__logo">
            {APP_NAME}
          </Link>
          <p>AI-powered branding for Indian businesses.</p>
        </div>

        {footerGroups.map((group) => (
          <div key={group.title} className="site-footer__column">
            <h4>{group.title}</h4>
            {group.links.map((link) => (
              <a key={link.label} href={link.href}>
                {link.label}
              </a>
            ))}
          </div>
        ))}

        <div className="site-footer__column site-footer__column--social">
          <h4>Follow Us</h4>
          {socialLinks.map((link) => (
            <a key={link.label} href={link.href} target="_blank" rel="noreferrer">
              {link.label}
            </a>
          ))}
        </div>
      </div>

      <div className="site-footer__bottom">
        <span>&copy; 2026 {APP_NAME}. All rights reserved.</span>
        <span>Made with ❤️ in India.</span>
        <span>A product by InsightsNode.</span>
      </div>
    </div>
  </footer>
);
