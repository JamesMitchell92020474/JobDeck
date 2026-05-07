const TECH_RE = /\b(software|developer|devops|frontend|back.?end|full.?stack|ui\/ux|ux\b|product\s*(manager|owner|designer)|data\s*(scientist|analyst|engineer)|machine\s*learning|sysadmin|systems?\s*engineer|network\s*engineer|security\s*engineer|qa\s*(engineer|analyst|tester)|test\s*(engineer|analyst)|programmer|web\s*developer|it\s*(support|specialist|manager|engineer)|platform\s*engineer|site\s*reliability|scrum\s*master|typescript|javascript|python|java\b|\.net\b|react\b|node\.?js|cloud\s*(engineer|architect)|xero|sharesies|auror|tracksuit|cin7|hnry)\b/i

const HOSP_RE = /\b(chef|sous\s*chef|head\s*chef|cook\b|kitchen\s*(hand|staff|team)|barista|waiter|waitress|bartender|bar\s*(staff|tender|manager)|hospitality\b|hotel\b|motel\b|restaurant\b|caf[eé]\b|food\s*(service|and\s*beverage|preparation)|beverage\b|front\s*desk|concierge|receptionist\b|housekeeping\b|retail\b|shop\s*assistant|sales\s*assistant|customer\s*service\b|cashier\b|checkout\b|floor\s*(staff|manager)|duty\s*manager\b|dining\b|catering\b|bakery\b|deli\b|sommelier)\b/i

function autoTag(title = '', description = '') {
  const text = `${title} ${description}`
  const isTech = TECH_RE.test(text)
  const isHosp = HOSP_RE.test(text)
  if (isTech && !isHosp) return 'tech'
  if (isHosp && !isTech) return 'hospitality'
  if (isTech && isHosp) {
    const techCount = (text.match(new RegExp(TECH_RE.source, 'gi')) || []).length
    const hospCount = (text.match(new RegExp(HOSP_RE.source, 'gi')) || []).length
    return techCount >= hospCount ? 'tech' : 'hospitality'
  }
  return null
}

module.exports = { autoTag }
