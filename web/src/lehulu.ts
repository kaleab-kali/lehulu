// The one script partners add: <script type="module" src=".../lehulu.js"></script>
// Registers <lehulu-signup>, <lehulu-jobs>, <lehulu-profile>, <lehulu-partner>, <lehulu-employer>,
// <lehulu-applications> and <lehulu-staff-sign-in>. Every element takes `lang` and an optional `api-base`.

import { loadFonts } from './engine/fonts';
import { LehuluSignup } from './components/lehulu-signup';
import { LehuluJobs } from './components/lehulu-jobs';
import { LehuluPartner } from './components/lehulu-partner';
import { LehuluProfile } from './components/lehulu-profile';
import { LehuluApplications } from './components/lehulu-applications';
import { LehuluEmployer } from './components/lehulu-employer';
import { LehuluStaffSignIn } from './components/lehulu-staff-sign-in';

export const VERSION = '0.2.0';

loadFonts();

const define = (name: string, ctor: CustomElementConstructor) => {
  if (!customElements.get(name)) customElements.define(name, ctor);
};
define('lehulu-staff-sign-in', LehuluStaffSignIn);
define('lehulu-signup', LehuluSignup);
define('lehulu-jobs', LehuluJobs);
define('lehulu-partner', LehuluPartner);
define('lehulu-profile', LehuluProfile);
define('lehulu-applications', LehuluApplications);
define('lehulu-employer', LehuluEmployer);

export { adaptPage } from './host';
export { LehuluSignup, LehuluJobs, LehuluPartner, LehuluProfile, LehuluApplications, LehuluEmployer, LehuluStaffSignIn };
