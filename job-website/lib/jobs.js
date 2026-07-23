// Shared helpers for job listing status. Auto-expiry is computed at READ
// time from closingDate, independent of the manually-set OPEN/CLOSED status
// column (brief: "Auto-expire listings once their closing date passes
// (independent of manual open/close)") — so a listing an admin forgot to
// close still stops accepting applications and disappears from public
// search the moment its closing date passes, with zero cron dependency.
function effectiveStatus(listing) {
  if (listing.status === 'CLOSED') return 'CLOSED';
  const now = new Date();
  const closing = new Date(listing.closingDate);
  // Treat closingDate as end-of-day.
  const endOfClosingDay = new Date(closing.getFullYear(), closing.getMonth(), closing.getDate(), 23, 59, 59, 999);
  if (now > endOfClosingDay) return 'EXPIRED';
  return 'OPEN';
}

function isAcceptingApplications(listing) {
  return effectiveStatus(listing) === 'OPEN';
}

function serializeListing(listing) {
  return {
    id: listing.id,
    title: listing.title,
    postingCompany: listing.postingCompany,
    employmentType: listing.employmentType,
    branch: listing.branch,
    shift: listing.shift,
    salaryMonth: listing.salaryMonth !== null && listing.salaryMonth !== undefined ? Number(listing.salaryMonth) : null,
    salaryCurrency: listing.salaryCurrency,
    summary: listing.summary,
    description: listing.description,
    requirements: listing.requirements,
    closingDate: listing.closingDate,
    status: effectiveStatus(listing),
    rawStatus: listing.status,
    createdAt: listing.createdAt,
  };
}

module.exports = { effectiveStatus, isAcceptingApplications, serializeListing };
