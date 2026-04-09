export function resolveOpenDayTier(score: number, isEligible: boolean) {
  if (!isEligible) {
    return {
      code: 'D' as const,
      label: 'D级(未达标)',
    };
  }

  if (score >= 80) {
    return { code: 'S' as const, label: 'S级(王牌)' };
  }

  if (score >= 60) {
    return { code: 'A' as const, label: 'A级(标杆)' };
  }

  if (score >= 40) {
    return { code: 'B' as const, label: 'B级(优质)' };
  }

  return { code: 'C' as const, label: 'C级(潜力)' };
}
