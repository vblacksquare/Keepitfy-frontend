
export function getComputedRgba(variableName: string, alpha?: number): string {
  if (typeof window === 'undefined') return 'rgba(0, 0, 0, 0)';

  const rootStyles = getComputedStyle(document.documentElement);
  const colorValue = rootStyles.getPropertyValue(variableName).trim();
  
  if (!colorValue) return 'rgba(0, 0, 0, 0)';

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) return 'rgba(0, 0, 0, 0)';
  
  ctx.fillStyle = colorValue;
  ctx.fillRect(0, 0, 1, 1);
  
  const [r, g, b, originalAlpha] = ctx.getImageData(0, 0, 1, 1).data;
  
  const finalAlpha = alpha !== undefined ? alpha : (originalAlpha / 255);
  
  return `rgba(${r}, ${g}, ${b}, ${finalAlpha})`;
}
