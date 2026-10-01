/**
 * Filtro del carrusel de cada robot, guardado en el backend para que sobreviva
 * a los reinicios del robot. El panel lo sigue aplicando en el robot con
 * POST /products/filter, y además lo guarda aquí.
 * Endpoints: /api/robots/{code}/product-filter
 */
window.RoboticsApi = window.RoboticsApi || {};

RoboticsApi.productFilter = (() => {
  const { request } = RoboticsApi.http;
  const filterPath = code => `/api/robots/${encodeURIComponent(code)}/product-filter`;

  return {
    /**
     * Filtro guardado, con el mismo formato que ProductFilterConfig de mini-app-qr:
     * {filterMode, enabledMerchants, hiddenProducts, pinnedProducts}.
     */
    get(robotCode) {
      return request('GET', filterPath(robotCode));
    },

    /**
     * Guarda cambios. Todos los campos son opcionales:
     * - filterMode: 'all' | 'blacklist' | 'whitelist'
     * - selectedMerchantId: número; null para quitarlo; sin enviar lo deja igual.
     * - products: [{id, merchantId, visible, pinned}] — se guardan uno por uno.
     */
    save(robotCode, { filterMode, selectedMerchantId, products } = {}) {
      const body = {};
      if (filterMode !== undefined) body.filter_mode = filterMode;
      if (selectedMerchantId !== undefined) {
        body.selected_merchant_id = selectedMerchantId === null ? null : Number(selectedMerchantId);
      }
      if (products !== undefined) {
        body.products = products.map(product => ({
          external_product_id: Number(product.id),
          merchant_id: Number(product.merchantId),
          visible: product.visible === true,
          pinned: product.pinned === true,
        }));
      }
      return request('PUT', filterPath(robotCode), { body });
    },
  };
})();
