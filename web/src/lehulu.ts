// The one script partners add: <script type="module" src=".../lehulu.js"></script>
// Registers <lehulu-signup>, <lehulu-jobs>, <lehulu-partner>, <lehulu-profile>, <lehulu-applications>.

import { loadFonts } from './engine/fonts';
import { LehuluSignup } from './components/lehulu-signup';
import { LehuluJobs } from './components/lehulu-jobs';
import { LehuluPartner } from './components/lehulu-partner';
import { LehuluProfile } from './components/lehulu-profile';
import { LehuluApplications } from './components/lehulu-applications';

export const VERSION = '0.1.0';

loadFonts();

const define = (name: string, ctor: CustomElementConstructor) => {
  if (!customElements.get(name)) customElements.define(name, ctor);
};
define('lehulu-signup', LehuluSignup);
define('lehulu-jobs', LehuluJobs);
define('lehulu-partner', LehuluPartner);
define('lehulu-profile', LehuluProfile);
define('lehulu-applications', LehuluApplications);

export { LehuluSignup, LehuluJobs, LehuluPartner, LehuluProfile, LehuluApplications };
