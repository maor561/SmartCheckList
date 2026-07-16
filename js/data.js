/**
 * Default Boeing 737 checklist.
 * Generic / condensed NG-style flow — a starting point, meant to be edited in-app.
 *
 * Shape:
 *   { id, name, items: [ { id, challenge, response } ] }
 *
 * `challenge` is what the app calls out. `response` is what you answer.
 * Underscores (___) mark values that change per flight; they are stripped
 * before speaking and before voice matching.
 */

const DEFAULT_CHECKLIST = {
  name: 'Boeing 737 — Generic',
  phases: [
    {
      id: 'preflight',
      name: 'Preflight',
      items: [
        { id: 'pf1', challenge: 'Oxygen', response: 'Tested, 100 percent' },
        { id: 'pf2', challenge: 'Navigation and display switches', response: 'Normal, Auto' },
        { id: 'pf3', challenge: 'Window heat', response: 'On' },
        { id: 'pf4', challenge: 'Pressurization mode selector', response: 'Auto' },
        { id: 'pf5', challenge: 'Flight instruments', response: 'Heading ___, Altimeter ___' },
        { id: 'pf6', challenge: 'Parking brake', response: 'Set' },
        { id: 'pf7', challenge: 'Engine start levers', response: 'Cutoff' },
      ],
    },
    {
      id: 'before-start',
      name: 'Before Start',
      items: [
        { id: 'bs1', challenge: 'Flight deck door', response: 'Closed and locked' },
        { id: 'bs2', challenge: 'Fuel', response: '___ kilos, pumps on' },
        { id: 'bs3', challenge: 'Passenger signs', response: 'Set' },
        { id: 'bs4', challenge: 'Windows', response: 'Locked' },
        { id: 'bs5', challenge: 'M C P', response: 'V2 ___, Heading ___, Altitude ___' },
        { id: 'bs6', challenge: 'Takeoff speeds', response: 'V1 ___, VR ___, V2 ___' },
        { id: 'bs7', challenge: 'C D U preflight', response: 'Completed' },
        { id: 'bs8', challenge: 'Rudder and aileron trim', response: 'Free and zero' },
        { id: 'bs9', challenge: 'Taxi and takeoff briefing', response: 'Completed' },
        { id: 'bs10', challenge: 'Anti collision light', response: 'On' },
      ],
    },
    {
      id: 'before-taxi',
      name: 'Before Taxi',
      items: [
        { id: 'bt1', challenge: 'Generators', response: 'On' },
        { id: 'bt2', challenge: 'Probe heat', response: 'On' },
        { id: 'bt3', challenge: 'Anti ice', response: 'As required' },
        { id: 'bt4', challenge: 'Isolation valve', response: 'Auto' },
        { id: 'bt5', challenge: 'Engine start switches', response: 'Continuous' },
        { id: 'bt6', challenge: 'Recall', response: 'Checked' },
        { id: 'bt7', challenge: 'Autobrake', response: 'R T O' },
        { id: 'bt8', challenge: 'Engine start levers', response: 'Idle detent' },
        { id: 'bt9', challenge: 'Flight controls', response: 'Checked' },
      ],
    },
    {
      id: 'before-takeoff',
      name: 'Before Takeoff',
      items: [
        { id: 'bto1', challenge: 'Flaps', response: '___, green light' },
        { id: 'bto2', challenge: 'Stabilizer trim', response: '___ units' },
        { id: 'bto3', challenge: 'Cabin', response: 'Secure' },
      ],
    },
    {
      id: 'after-takeoff',
      name: 'After Takeoff',
      items: [
        { id: 'at1', challenge: 'Engine bleeds', response: 'On' },
        { id: 'at2', challenge: 'Packs', response: 'Auto' },
        { id: 'at3', challenge: 'Landing gear', response: 'Up and off' },
        { id: 'at4', challenge: 'Flaps', response: 'Up, no lights' },
        { id: 'at5', challenge: 'Altimeter', response: 'Set' },
      ],
    },
    {
      id: 'descent',
      name: 'Descent',
      items: [
        { id: 'ds1', challenge: 'Pressurization', response: 'Landing altitude ___' },
        { id: 'ds2', challenge: 'Recall', response: 'Checked' },
        { id: 'ds3', challenge: 'Autobrake', response: '___' },
        { id: 'ds4', challenge: 'Landing data', response: 'V ref ___, Minimums ___' },
        { id: 'ds5', challenge: 'Approach briefing', response: 'Completed' },
      ],
    },
    {
      id: 'approach',
      name: 'Approach',
      items: [
        { id: 'ap1', challenge: 'Altimeter', response: '___' },
      ],
    },
    {
      id: 'landing',
      name: 'Landing',
      items: [
        { id: 'ld1', challenge: 'Engine start switches', response: 'Continuous' },
        { id: 'ld2', challenge: 'Speedbrake', response: 'Armed' },
        { id: 'ld3', challenge: 'Landing gear', response: 'Down' },
        { id: 'ld4', challenge: 'Flaps', response: '___, green light' },
      ],
    },
    {
      id: 'shutdown',
      name: 'Shutdown',
      items: [
        { id: 'sd1', challenge: 'Fuel pumps', response: 'Off' },
        { id: 'sd2', challenge: 'Probe heat', response: 'Auto' },
        { id: 'sd3', challenge: 'Hydraulic panel', response: 'Set' },
        { id: 'sd4', challenge: 'Flaps', response: 'Up' },
        { id: 'sd5', challenge: 'Parking brake', response: 'Set' },
        { id: 'sd6', challenge: 'Engine start levers', response: 'Cutoff' },
        { id: 'sd7', challenge: 'Weather radar', response: 'Off' },
      ],
    },
    {
      id: 'secure',
      name: 'Secure',
      items: [
        { id: 'sc1', challenge: 'I R Ss', response: 'Off' },
        { id: 'sc2', challenge: 'Emergency exit lights', response: 'Off' },
        { id: 'sc3', challenge: 'Window heat', response: 'Off' },
        { id: 'sc4', challenge: 'Packs', response: 'Off' },
      ],
    },
  ],
};
