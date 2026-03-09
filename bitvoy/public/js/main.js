/*
	For HTML5 UP
*/
(() => {
	const $window = window;
	const $body = document.body;
	const $wrapper = document.getElementById('wrapper');
	const $header = document.getElementById('header');
	const $banner = document.getElementById('banner');

	// Browser detection
	function getBrowserName() {
		const ua = navigator.userAgent;
		if (/MSIE|Trident/.test(ua)) return 'ie';
		if (/Edg/.test(ua)) return 'edge';
		return 'other';
	}

	function isMobile() {
		return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
	}

	// Utility: matchMedia watcher
	function watchMediaQuery(queryString, onMatch, onUnmatch) {
		const mq = window.matchMedia(queryString);
		const apply = e => {
			if (e.matches) onMatch();
			else onUnmatch();
		};
		apply(mq);
		mq.addEventListener('change', apply);
	}

	// Parallax effect
	function applyParallax(elements, intensity = 0.25) {
		if (['ie', 'edge'].includes(getBrowserName()) || isMobile()) return;

		elements.forEach(el => {
			const onScroll = () => {
				const scrollTop = window.scrollY || window.pageYOffset;
				const elTop = el.getBoundingClientRect().top + scrollTop;
				const pos = scrollTop - elTop;
				el.style.backgroundPosition = `center ${pos * (-1 * intensity)}px`;
			};

			const enable = () => {
				el.style.backgroundPosition = 'center 0px';
				window.addEventListener('scroll', onScroll);
			};

			const disable = () => {
				el.style.backgroundPosition = '';
				window.removeEventListener('scroll', onScroll);
			};

			watchMediaQuery('(max-width: 980px)', disable, enable);
		});

		const triggerScroll = () => window.dispatchEvent(new Event('scroll'));
		window.removeEventListener('load', triggerScroll);
		window.removeEventListener('resize', triggerScroll);
		window.addEventListener('load', triggerScroll);
		window.addEventListener('resize', triggerScroll);
	}

	// Page load animation
	window.addEventListener('load', () => {
		setTimeout(() => {
			// BitVoyの初期化が完了するまで待機
			if (window.BITVOY_LOADING === false) {
				document.body.classList.remove('is-preload');
			} else {
				// BitVoyの初期化完了を待つ
				window.addEventListener('bitvoy_app_ready', () => {
					document.body.classList.remove('is-preload');
				}, { once: true });
			}
		}, 100);
	});

	// Clear transition state
	['unload', 'pagehide'].forEach(evt => {
		window.addEventListener(evt, () => {
			setTimeout(() => {
				document.querySelectorAll('.is-transitioning').forEach(el => {
					el.classList.remove('is-transitioning');
				});
			}, 250);
		});
	});

	// IE/Edge detection
	if (['ie', 'edge'].includes(getBrowserName())) {
		document.body.classList.add('is-ie');
	}

	// Scrolly
	document.querySelectorAll('.scrolly').forEach(el => {
		el.addEventListener('click', event => {
			event.preventDefault();
			const targetId = el.getAttribute('href');
			if (!targetId || !targetId.startsWith('#') || targetId.length < 2) return;
			const target = document.querySelector(targetId);
			if (target) {
				const headerOffset = $header.offsetHeight - 2;
				const elementPosition = target.getBoundingClientRect().top + window.scrollY;
				const offsetPosition = elementPosition - headerOffset;
				window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
			}
		});
	});

	// Tiles
	document.querySelectorAll('.tiles > article').forEach(tile => {
		const imageWrapper = tile.querySelector('.image');
		const img = imageWrapper?.querySelector('img');
		const link = tile.querySelector('.link');

		if (img) {
			// モバイル表示（736px以下）では背景画像とインラインスタイルを設定しない
			const isMobile = window.matchMedia('(max-width: 736px)').matches;
			if (!isMobile) {
				tile.style.backgroundImage = `url(${img.getAttribute('src')})`;
				const pos = img.dataset.position;
				if (pos) imageWrapper.style.backgroundPosition = pos;
				imageWrapper.style.display = 'none';
			}
			
			// リサイズ時に再評価
			window.addEventListener('resize', () => {
				const isMobileNow = window.matchMedia('(max-width: 736px)').matches;
				if (isMobileNow) {
					tile.style.backgroundImage = '';
					imageWrapper.style.display = '';
				} else {
					tile.style.backgroundImage = `url(${img.getAttribute('src')})`;
					const pos = img.dataset.position;
					if (pos) imageWrapper.style.backgroundPosition = pos;
					imageWrapper.style.display = 'none';
				}
			});
		}

		if (link) {
			const clonedLink = link.cloneNode(true);
			clonedLink.textContent = '';
			clonedLink.removeAttribute('data-i18n'); // i18n属性を削除してテキストが表示されないようにする
			clonedLink.classList.add('primary');
			tile.appendChild(clonedLink);

			[link, clonedLink].forEach(l => {
				l.addEventListener('click', e => {
					e.preventDefault();
					e.stopPropagation();
					const href = l.getAttribute('href');
					const target = l.getAttribute('target');

					// javascript: URLの場合はCSP違反を避けるため、直接実行しない
					if (href && href.startsWith('javascript:')) {
						return;
					}

					if (target === '_blank') {
						window.open(href);
					} else {
						// SPAコンテキストでは、ハッシュルーティングを使用する場合はis-transitioningを追加しない
						// または、追加した場合は適切に削除する
						if (href && href.startsWith('#')) {
							// ハッシュルーティングの場合は、is-transitioningを追加せずに直接遷移
							window.location.hash = href;
						} else {
							// 通常のページ遷移の場合のみis-transitioningを追加
						tile.classList.add('is-transitioning');
						$wrapper?.classList.add('is-transitioning');
						setTimeout(() => {
							if (href && href !== '#' && !href.startsWith('javascript:')) {
								location.href = href;
								} else {
									// 遷移しない場合はis-transitioningを削除
									tile.classList.remove('is-transitioning');
									$wrapper?.classList.remove('is-transitioning');
							}
						}, 500);
						}
					}
				});
			});
		}
	});

	// Banner
	if ($banner) {
		const imageWrapper = $banner.querySelector('.image');
		const img = imageWrapper?.querySelector('img');
		applyParallax([$banner], 0.275);
		if (imageWrapper && img) {
			$banner.style.backgroundImage = `url(${img.getAttribute('src')})`;
			imageWrapper.style.display = 'none';
		}
	}

	// Header scroll behavior
	if ($banner && $header.classList.contains('alt')) {
		const onScroll = () => {
			const bannerRect = $banner.getBoundingClientRect();
			const headerHeight = $header.offsetHeight + 10;
			if (bannerRect.bottom <= headerHeight) {
				$header.classList.remove('alt');
				$header.classList.add('reveal');
			} else {
				$header.classList.add('alt');
				$header.classList.remove('reveal');
			}
		};
		window.addEventListener('resize', onScroll);
		window.addEventListener('load', () => {
			onScroll();
			window.addEventListener('scroll', onScroll);
			setTimeout(onScroll, 100);
		});
	}

	// Menu
const menu = document.getElementById('menu');
const body = document.body;


const menuInner = document.createElement('div');
menuInner.className = 'inner';


while (menu.firstChild) {
	menuInner.appendChild(menu.firstChild);
}
menu.appendChild(menuInner);

// --- _locked $B>uBV$H@)8f%a%=%C%I$r(B menu $B$K%P%$%s%I!JD>@\%W%m%Q%F%#$H$7$F!K(B ---
menu._locked = false;

menu._lock = function () {
	if (menu._locked) return false;
	menu._locked = true;
	setTimeout(() => {
		menu._locked = false;
	}, 350);
	return true;
};

menu._show = function () {
	if (menu._lock()) body.classList.add('is-menu-visible');
};

menu._hide = function () {
	if (menu._lock()) body.classList.remove('is-menu-visible');
};

menu._toggle = function () {
	if (menu._lock()) body.classList.toggle('is-menu-visible');
};


menuInner.addEventListener('click', event => {
	event.stopPropagation();
});


menuInner.querySelectorAll('a').forEach(link => {
	link.addEventListener('click', event => {
		event.preventDefault();
		event.stopPropagation();

		const href = link.getAttribute('href');
		menu._hide();

		setTimeout(() => {
			// javascript: URLの場合はCSP違反を避けるため、直接実行しない
			if (href && href.startsWith('javascript:')) {
				// javascript: URLの場合は、リンクのonclick属性を実行するか、何もしない
				// 実際の処理はリンク自体のonclick属性で行われる
				return;
			}
			// ハッシュリンク（#で始まるリンク）の場合は、SPAルーティングを使用
			if (href && href.startsWith('#')) {
				window.location.hash = href;
				return;
			}
			// 通常のURLの場合のみ遷移
			if (href && href !== '#' && !href.startsWith('javascript:')) {
				window.location.href = href;
			}
		}, 250);
	});
});


menu.addEventListener('click', event => {
	event.preventDefault();
	event.stopPropagation();
	body.classList.remove('is-menu-visible');
});


const closeLink = document.createElement('a');
closeLink.className = 'close';
closeLink.href = '#menu';
closeLink.textContent = 'Close';
menu.appendChild(closeLink);


	document.body.querySelectorAll('a[href="#menu"]').forEach(trigger => {
		trigger.addEventListener('click', e => {
			e.preventDefault();
			e.stopPropagation();
			menu._toggle();
		});
	});

	document.body.addEventListener('click', menu._hide);
	document.body.addEventListener('keydown', e => {
		if (e.key === 'Escape' || e.keyCode === 27) menu._hide();
	});

	// Remove is-preload class to show content
	if (document.body.classList.contains('is-preload')) {
		window.addEventListener('load', () => {
			document.body.classList.remove('is-preload');
		});
		// Also try immediate removal if DOM is already loaded
		if (document.readyState === 'complete' || document.readyState === 'interactive') {
			setTimeout(() => {
				document.body.classList.remove('is-preload');
			}, 100);
		}
	}
})();

