import { describe, expect, it } from 'vitest';
import { generateFieldCopy, EventSkeleton, RelationContext, VoiceProfile } from './CopyAssembler';

describe('CopyAssembler', () => {
  const skeleton: EventSkeleton = {
    eventType: 'viewing_declined',
    primaryActor: '李阿姨',
    concreteFact: '把密码盒摘了',
  };

  const context: RelationContext = {
    daysSinceLastContact: 5,
    trustLevel: 'hostile',
  };

  it('generates distinct copy for anxious voice', () => {
    const voice: VoiceProfile = { style: 'anxious', focus: 'emotion' };
    const result = generateFieldCopy(skeleton, context, voice);
    expect(result).toContain('坏了坏了，这单李阿姨把密码盒摘了，情绪不太对劲');
    expect(result).toContain('得赶紧打个电话赔个笑脸了！');
  });

  it('generates distinct copy for steady voice', () => {
    const voice: VoiceProfile = { style: 'steady', focus: 'logic' };
    const result = generateFieldCopy(skeleton, context, voice);
    expect(result).toContain('看来晾太久了，这单李阿姨把密码盒摘了，明显是冲着咱们来的');
    expect(result).toContain('去探探口风。');
  });

  it('generates distinct copy for aggressive voice', () => {
    const voice: VoiceProfile = { style: 'aggressive', focus: 'urgency' };
    const result = generateFieldCopy(skeleton, context, voice);
    expect(result).toContain('胆子够肥啊，这单李阿姨把密码盒摘了，这事儿不能拖了');
    expect(result).toContain('提点水果登门把面子挣回来。');
  });
});
