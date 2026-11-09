import { Link, useNavigate } from 'react-router-dom';
import { Utensils, ArrowRight } from 'lucide-react';
import { useContext, useEffect } from 'react';
import { IMAGES } from '../constants/images';
import { AuthContext } from '../context/AuthContext';
import CustomerDashboard from '../components/CustomerDashboard';

const LandingPage = () => {
  const { user } = useContext(AuthContext) as any;
  const navigate = useNavigate();

  useEffect(() => {
    if (user && user.role === 'admin') {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  // If logged in as customer, render the Customer Dashboard
  if (user && user.role === 'customer') {
    return <CustomerDashboard />;
  }

  return (
    <div className="relative min-h-[calc(100vh-65px)] bg-white flex flex-col justify-center overflow-hidden">
      {/* Chicken Inasal Photo Hero Background */}
      <div className="absolute inset-0 pointer-events-none select-none z-0">
        <img 
          src={IMAGES.HERO_BG} 
          alt="Chicken Inasal Gip's Kitchen" 
          className="w-full h-full object-cover object-center"
          referrerPolicy="no-referrer"
          onError={(e) => {
            // Graceful fallback if image file is being uploaded/updated
            if (e.currentTarget.src !== window.location.origin + IMAGES.INASAL_HERO) {
              e.currentTarget.src = IMAGES.INASAL_HERO;
            }
          }}
        />
        {/* Subtle soft overlay so food photo remains clearly visible while text stays readable */}
        <div className="absolute inset-0 bg-white/60" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-transparent to-white/80" />
      </div>

      {/* Hero Section */}
      <section className="relative z-10 py-14 sm:py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center">
          
          <div className="w-20 h-20 sm:w-24 sm:h-24 aspect-square rounded-full overflow-hidden shadow-md border-2 border-dark/80 bg-dark mb-4 ring-4 ring-orange-200/50 flex items-center justify-center shrink-0">
            <img 
              src={IMAGES.LOGO} 
              alt="Gip's Kitchen Logo" 
              className="w-full h-full object-cover object-center scale-[1.18]" 
            />
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-white/90 backdrop-blur-sm border border-orange-200/80 rounded-full text-xs font-bold text-dark/80 mb-6 uppercase tracking-wider shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span>Official Gip's Kitchen Food & Drinks</span>
          </div>

          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black mb-6 tracking-tight text-dark leading-[1.05]">
            Your Favorite <br />
            <span className="text-primary">Chill Spot</span> in Bulan.
          </h1>

          <p className="text-base sm:text-lg md:text-xl mb-10 max-w-2xl mx-auto text-dark/75 font-medium leading-relaxed">
            Home of the best Sizzling Sisig and the coldest drinks. Order ahead online and pick up fresh and hot at your convenience.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto w-full">
            <Link 
              to="/menu" 
              className="flex-1 bg-primary text-white hover:bg-primary/90 px-6 py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all border border-transparent shadow-sm hover:shadow active:translate-y-0.5"
            >
              <Utensils size={18} />
              <span>Browse Menu</span>
            </Link>
            <Link 
              to="/about" 
              className="flex-1 bg-white border border-orange-200/80 text-dark hover:bg-orange-50/50 px-6 py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-xs active:translate-y-0.5"
            >
              <span>About Pickup</span>
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;

