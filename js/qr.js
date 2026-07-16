// 주어진 주소를 QR 코드(SVG)로 그린다. 핸드폰 카메라로 찍어서 바로 열 수 있게 하려는 용도다.
// 라이브러리는 CDN에서 받아오므로 인터넷이 없으면 실패한다 → 그 경우 false를 돌려주고,
// 부르는 쪽에서 주소 글자를 대신 크게 보여준다.

/**
 * @param {HTMLElement} container QR를 넣을 요소
 * @param {string} url QR에 담을 주소
 * @returns {Promise<boolean>} 성공하면 true, CDN 실패 등으로 못 그리면 false
 */
export async function renderQR(container, url) {
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm');
    const qrcode = mod.default || mod;

    const qr = qrcode(0, 'M');   // 0 = 데이터 길이에 맞춰 크기 자동, M = 중간 오류복원
    qr.addData(url);
    qr.make();

    // SVG로 그린다. 확대해도 또렷하고, 이미지 파일을 따로 안 만들어도 된다.
    container.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 4, scalable: true });
    return true;
  } catch (err) {
    console.warn('QR 코드를 그릴 수 없어요 (인터넷 연결 확인).', err);
    container.innerHTML = '';
    return false;
  }
}

/**
 * 핸드폰에서 열 주소를 정한다.
 * 지금 페이지가 공개 주소(https)면 그대로 쓰고, localhost나 file://이면
 * 배포된 주소를 쓴다. (핸드폰은 이 컴퓨터의 localhost에 접속할 수 없기 때문)
 */
export function shareableUrl() {
  const { protocol, hostname, href } = window.location;
  const isLocal =
    protocol === 'file:' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.') ||
    hostname.endsWith('.local');

  // ↓ 배포 주소가 바뀌면 이 한 줄만 고치면 된다.
  const DEPLOYED = 'https://summer-6hby.vercel.app';

  return isLocal ? DEPLOYED : href.split('#')[0];
}
