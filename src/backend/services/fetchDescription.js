function normaliseJobType(raw) {
  if (!raw) return '';
  const s = raw.toLowerCase().replace(/[-_]/g, ' ').trim();
  if (s.includes('full')) return 'Full time';
  if (s.includes('part')) return 'Part time';
  if (s.includes('contract') || s.includes('temp')) return 'Contract/Temp';
  if (s.includes('casual')) return 'Casual';
  if (s.includes('intern')) return 'Internship';
  return raw.trim();
}

async function fetchDescriptionPage(context, url) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(1500);

    return await page.evaluate(() => {
      const KEEP_TAGS = new Set(['p','ul','ol','li','strong','b','em','i','h1','h2','h3','h4','br','a']);

      function cleanEl(el) {
        el.querySelectorAll('a[href^="tel:"]').forEach(a => {
          a.textContent = decodeURIComponent(a.href.replace('tel:', '').trim()) || a.textContent;
        });
        el.querySelectorAll('a[href^="mailto:"]').forEach(a => {
          a.textContent = decodeURIComponent(a.href.replace('mailto:', '').split('?')[0].trim()) || a.textContent;
        });
        el.querySelectorAll('script,style,button,input,select,form,svg,img,[class*="apply"],[class*="button"],[class*="social"],[class*="share"]').forEach(n => n.remove());
        const BLOCK_TAGS = new Set(['div','section','article','header','footer','aside','main','figure','figcaption']);
        el.querySelectorAll([...BLOCK_TAGS].join(',')).forEach(node => {
          const p = document.createElement('p');
          while (node.firstChild) p.appendChild(node.firstChild);
          node.parentNode?.replaceChild(p, node);
        });
        const unwrap = node => {
          if (node.nodeType === 1 && !KEEP_TAGS.has(node.tagName.toLowerCase())) {
            const parent = node.parentNode;
            if (parent) {
              while (node.firstChild) parent.insertBefore(node.firstChild, node);
              parent.removeChild(node);
            }
          }
        };
        [...el.querySelectorAll('*')].reverse().forEach(unwrap);
        el.querySelectorAll('*').forEach(n => {
          [...n.attributes].forEach(attr => {
            if (!(n.tagName === 'A' && attr.name === 'href')) n.removeAttribute(attr.name);
          });
        });
        let empties = 0;
        [...el.querySelectorAll('p')].forEach(p => {
          if (!p.textContent.trim()) { empties++; if (empties > 1) p.remove(); }
          else empties = 0;
        });
        return el.innerHTML.trim();
      }

      const postedEl = document.querySelector('[data-automation="job-detail-date"]') ||
                       document.querySelector('[data-automation="jobPostDate"]') ||
                       document.querySelector('[data-automation="jobListingDate"]') ||
                       document.querySelector('time[datetime]') ||
                       document.querySelector('time');

      function resolveDate(el) {
        if (!el) return '';
        const iso = el.getAttribute('datetime');
        if (iso) {
          const d = new Date(iso);
          if (!isNaN(d)) {
            const now = new Date();
            return d.toLocaleDateString('en-NZ', {
              day: 'numeric', month: 'short',
              year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
            });
          }
        }
        const txt = el.textContent.trim();
        const dMatch = txt.match(/^(\d+)\s*d(?:ays?)?\s+ago/i);
        if (dMatch) {
          const d = new Date();
          d.setDate(d.getDate() - parseInt(dMatch[1]));
          return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
        }
        const hMatch = txt.match(/^(\d+)\s*h(?:ours?)?\s+ago/i);
        if (hMatch) return new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
        return txt;
      }
      const postingDate = resolveDate(postedEl);

      const jobTypeEl = document.querySelector('[data-automation="job-detail-work-type"]') ||
                        document.querySelector('[data-automation="workType"]') ||
                        document.querySelector('[class*="workType"]');
      const jobType = jobTypeEl?.textContent?.trim() || '';

      const salaryEl = document.querySelector('[data-automation="job-detail-salary"]') ||
                       document.querySelector('[data-automation="salary"]') ||
                       document.querySelector('[class*="salary"]') ||
                       document.querySelector('[class*="Salary"]');
      const rawSalary = salaryEl?.textContent?.trim() || '';
      const salary = /(\$[\d,]+|[\d,]+k|\d+\s*(per\s*(hour|hr|year|annum|pa)|p\.h\.|p\.a\.))/i.test(rawSalary) ? rawSalary : '';

      const jobHeader = document.querySelector('[data-automation="job-detail-header"]') ||
                        document.querySelector('[data-automation="jobDetailsHeader"]') ||
                        document.querySelector('[data-automation="job-detail-page"]')?.firstElementChild ||
                        document.querySelector('main > *:first-child') ||
                        document.querySelector('header');
      const scope = jobHeader || document;
      const logoEl = scope.querySelector('[data-automation="company-logo"] img') ||
                     scope.querySelector('[class*="CompanyLogo"] img') ||
                     scope.querySelector('[class*="company-logo"] img') ||
                     scope.querySelector('[class*="companyLogo"] img') ||
                     scope.querySelector('img[src*="logo"]') ||
                     scope.querySelector('img[src*="company"]');
      const logoUrl = logoEl?.src || '';

      const seekDesc = document.querySelector('[data-automation="jobAdDetails"]') ||
                       document.querySelector('[data-automation="job-detail-page-job-description"]');
      if (seekDesc) return { html: cleanEl(seekDesc), logoUrl, postingDate, jobType, salary };

      const tmDesc = document.querySelector('.tm-markdown') ||
                     document.querySelector('[class*="job-description"]');
      if (tmDesc) return { html: cleanEl(tmDesc), logoUrl, postingDate, jobType, salary };

      const generic = document.querySelector('#jobDescriptionText') ||
                      document.querySelector('[class*="description"]') ||
                      document.querySelector('[class*="job-body"]') ||
                      document.querySelector('article') ||
                      document.querySelector('main');
      if (!generic) return { html: '', logoUrl, postingDate, jobType, salary };
      const html = cleanEl(generic);
      return { html: html.length > 12000 ? html.slice(0, 12000) : html, logoUrl, postingDate, jobType, salary };
    });
  } finally {
    await page.close();
  }
}

module.exports = { fetchDescriptionPage, normaliseJobType };
