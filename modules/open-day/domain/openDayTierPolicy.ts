export function resolveOpenDayTier(score: number, isEligible: boolean) {
  if (!isEligible) {
    return {
      code: 'D' as const,
      label: 'D级(未达标)',
    };
  }

  if (score > 65) {
    return { code: 'S' as const, label: 'S级(王牌)' };
  }

  if (score > 50) {
    return { code: 'A' as const, label: 'A级(标杆)' };
  }

  if (score > 35) {
    return { code: 'B' as const, label: 'B级(优质)' };
  }

  if (score > 20) {
    return { code: 'C' as const, label: 'C级(潜力)' };
  }

  return { code: 'D' as const, label: 'D级(未达标)' };
}
