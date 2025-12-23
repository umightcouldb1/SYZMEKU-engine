export function drawSoundGlyphs(ctx, dataArray, width, height) {
  if (!ctx) {
    return;
  }

  ctx.clearRect(0, 0, width, height);
  const bars = 100;

  for (let i = 0; i < bars; i += 1) {
    const value = dataArray[i] / 256;
    const barHeight = value * height;
    const hue = (i * 360) / bars;
    ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;

    ctx.fillRect(i * (width / bars), height - barHeight, width / bars - 2, barHeight);

    if (barHeight > height * 0.6) {
      ctx.font = '16px Courier New';
      ctx.fillStyle = '#fff';
      ctx.fillText('✶', i * (width / bars) + 4, height - barHeight - 8);
    }
  }
}
