import { ShoppingBag, Store, Clock, Utensils, MapPin, Phone, Facebook, Sparkles, CheckCircle2 } from 'lucide-react';
import { IMAGES } from '../constants/images';
import { Link } from 'react-router-dom';

const About = () => {
  const pickupPillars = [
    {
      title: "Online Menu Ordering",
      description: "View our current menu and place your order online from your phone or desktop before visiting the store.",
      icon: <ShoppingBag size={24} className="text-dark" />
    },
    {
      title: "Order Preparation",
      description: "After payment is verified, your order can proceed to processing and preparation by our kitchen staff.",
      icon: <Utensils size={24} className="text-dark" />
    },
    {
      title: "Counter Pickup",
      description: "All orders are for direct in-store pickup at our Bulan branch.",
      icon: <Store size={24} className="text-dark" />
    }
  ];

  const pickupSteps = [
    {
      step: "01",
      title: "Select Menu Items",
      description: "Browse the menu, add your chosen dishes to the cart, and submit your pickup order.",
      icon: <ShoppingBag size={18} />,
      image: IMAGES.ABOUT_KITCHEN
    },
    {
      step: "02",
      title: "Confirm Payment via GCash",
      description: "Submit your GCash payment and upload the transaction screenshot through your My Bill page. Your payment will be reviewed before the order proceeds to processing.",
      icon: <CheckCircle2 size={18} />,
      image: IMAGES.INNOVATION_IMG
    },
    {
      step: "03",
      title: "Collect at the Counter",
      description: "Track your order status through your account. When your order is marked Ready for Pickup, present your Order ID at our Bulan store counter to collect your order.",
      icon: <Store size={18} />,
      image: IMAGES.ABOUT_LOUNGE
    }
  ];

  return (
    <div className="min-h-screen bg-white py-12 px-4">
      <div className="max-w-6xl mx-auto space-y-16">
        {/* Mission & Online Pickup Vision */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 bg-gray-200 text-dark px-3 py-1 rounded text-xs font-bold uppercase tracking-wider mb-4 border border-gray-300">
            <Sparkles size={14} />
            <span>STORE PICKUP INFORMATION</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-dark mb-4 tracking-tight">
            Order Online for <br />
            <span className="text-primary">Store Pickup in Bulan</span>
          </h1>
          <p className="text-gray-600 text-sm md:text-base leading-relaxed font-medium">
            Browse our menu online, submit your order, and pick up your packaged food directly from our kitchen counter in Bulan, Sorsogon.
          </p>
        </div>

        {/* Pickup Pillars Section */}
        <div className="grid md:grid-cols-3 gap-6">
          {pickupPillars.map((pillar, index) => (
            <div
              key={index}
              className="bg-white p-6 rounded-xl border border-gray-200 hover:border-dark transition-colors"
            >
              <div className="bg-gray-100 w-12 h-12 rounded-lg border border-gray-200 flex items-center justify-center mb-4">
                {pillar.icon}
              </div>
              <h3 className="text-base font-bold text-dark mb-2">{pillar.title}</h3>
              <p className="text-xs text-gray-600 leading-relaxed font-medium">{pillar.description}</p>
            </div>
          ))}
        </div>

        {/* How Self-Pickup Works */}
        <div className="space-y-8">
          <div className="text-center">
            <h2 className="text-2xl md:text-3xl font-black text-dark tracking-tight">How Store Pickup Works</h2>
            <p className="text-xs text-gray-500 font-medium mt-1">A simple 3-step process to order and collect your food.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {pickupSteps.map((step, index) => (
              <div
                key={index}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                <div className="relative h-48 bg-gray-100">
                  <img 
                    src={step.image} 
                    alt={step.title} 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute top-3 left-3 bg-dark text-white p-2 rounded-lg">
                    {step.icon}
                  </div>
                  <div className="absolute bottom-3 right-3 bg-dark text-white px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
                    STEP {step.step}
                  </div>
                </div>
                <div className="p-5">
                  <h3 className="text-sm font-bold text-dark mb-1.5">{step.title}</h3>
                  <p className="text-xs text-gray-600 leading-relaxed font-medium">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Meet the Kitchen Crew */}
        <div className="bg-white rounded-xl border border-gray-200 p-8 md:p-12">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-1.5 bg-dark text-white px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider mb-4">
              <Store size={14} />
              <span>KITCHEN OPERATIONS</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-dark mb-4 tracking-tight">Prepared by Our Kitchen Staff</h2>
            <p className="text-xs md:text-sm text-gray-600 leading-relaxed mb-6 font-medium">
              Online orders are prepared and packaged by our kitchen staff for counter pickup. Customers can monitor their order status through their account.
            </p>
            <div className="space-y-3">
              <div className="flex items-center gap-3.5 p-3.5 bg-gray-50 rounded-lg border border-gray-200">
                <div className="w-10 h-10 rounded-lg bg-dark text-white flex items-center justify-center font-bold text-xs">GK</div>
                <div>
                  <p className="font-bold text-dark text-xs">Gip's Kitchen Counter Pickup</p>
                  <p className="text-[11px] text-gray-500 font-medium">In-store pickup • Bulan, Sorsogon</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Commitment Section */}
        <div className="bg-dark rounded-xl p-8 md:p-12 text-white border border-gray-900">
          <div className="max-w-2xl">
            <h2 className="text-2xl md:text-3xl font-black mb-3">Pickup Guidelines</h2>
            <p className="text-gray-300 text-xs md:text-sm mb-6 leading-relaxed">
              Review your order details before submitting payment. After payment is verified and your order is processed, monitor your order status through your account. Please proceed to the store when your order is marked Ready for Pickup and present your Order ID at the counter.
            </p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary text-white flex items-center justify-center font-bold text-xs">GK</div>
              <div>
                <p className="font-bold text-xs">Gip's Kitchen Staff</p>
                <p className="text-[11px] text-gray-400">Store Operations</p>
              </div>
            </div>
          </div>
        </div>

        {/* Location, Contact & Hours Section */}
        <footer className="bg-dark text-white rounded-xl p-8 md:p-12 border border-gray-900">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div className="col-span-1 md:col-span-2">
              <Link to="/" className="flex items-center gap-2 text-xl font-black tracking-tight mb-4">
                <div className="bg-dark p-0.5 rounded overflow-hidden w-8 h-8 flex items-center justify-center border border-gray-700">
                  <img src={IMAGES.LOGO} alt="Logo" className="w-full h-full object-contain" />
                </div>
                <span>GIP'S <span className="text-primary">KITCHEN</span></span>
              </Link>
              <p className="text-gray-400 text-xs max-w-md leading-relaxed">
                Sizzling meals, drinks, and local favorites available for online ordering and in-store pickup in Bulan, Sorsogon.
              </p>
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider mb-4 text-white">STORE LOCATION</h4>
              <ul className="space-y-2.5 text-gray-400 text-xs">
                <li className="flex items-start gap-2.5">
                  <MapPin size={15} className="text-primary shrink-0 mt-0.5" />
                  <span>Bulan, Sorsogon, Philippines</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Clock size={15} className="text-primary shrink-0" />
                  <span>Open Daily: 2:00 PM – 1:00 AM</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Phone size={15} className="text-primary shrink-0" />
                  <span>+63 9612 420 555</span>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider mb-4 text-white">Follow Us</h4>
              <div className="flex gap-2">
                <a href="https://facebook.com" target="_blank" rel="noreferrer" className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center hover:bg-primary transition-colors">
                  <Facebook size={16} className="text-gray-300 hover:text-white" />
                </a>
              </div>
            </div>
          </div>
          <div className="pt-6 border-t border-white/10 text-center text-gray-500 text-xs font-medium">
            <p>© {new Date().getFullYear()} Gip's Kitchen. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default About;
