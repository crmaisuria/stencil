/*
 Import all product specific js
 */
import $ from 'jquery';
import utils from 'bigcommerce-stencil/stencil-utils';
import 'foundation/js/foundation/foundation';
import 'foundation/js/foundation/foundation.reveal';
import ImageGallery from '../product/image-gallery';
import _ from 'lodash';

export default class Product {
    constructor($scope, context) {
        this.$scope = $scope;
        this.context = context;
        this.productOptions();
        this.quantityChange();
        this.addProductToCart();
        this.imageGallery = new ImageGallery($('[data-image-gallery]', this.$scope));
        this.imageGallery.init();
    }

    /**
     * Since $productView can be dynamically inserted using render_with,
     * We have to retrieve the respective elements
     *
     * @param $scope
     */
    getViewModel($scope) {
        return {
            $priceWithTax: $('[data-product-price-with-tax]', $scope),
            $rrpWithTax: $('[data-product-rrp-with-tax]', $scope),
            $priceWithoutTax: $('[data-product-price-without-tax]', $scope),
            $rrpWithoutTax: $('[data-product-rrp-without-tax]', $scope),
            $weight: $('.productView-info [data-product-weight]', $scope),
            $increments: $('.form-field--increments :input', $scope),
            $addToCart: $('#form-action-addToCart', $scope),
            $wishlistVariation: $('[data-wishlist-add] [name="variation_id"]', $scope),
            stock: {
                $container: $('.form-field--stock', $scope),
                $input: $('[data-product-stock]', $scope),
            },
            $sku: $('[data-product-sku]'),
            quantity: {
                $text: $('.incrementTotal', $scope),
                $input: $('[name=qty\\[\\]]', $scope),
            },
        };
    }

    /**
     *
     * Handle product options changes
     *
     */
    productOptions() {
        utils.hooks.on('product-option-change', (event, changedOption) => {
            const $changedOption = $(changedOption);
            const $form = $changedOption.parents('form');
            const productId = $('[name="product_id"]', $form).val();

            // Do not trigger an ajax request if it's a file or if the browser doesn't support FormData
            if ($changedOption.attr('type') === 'file' || window.FormData === undefined) {
                return;
            }

            utils.api.productAttributes.optionChange(productId, $form.serialize(), (err, response) => {
                const viewModel = this.getViewModel(this.$scope);
                const $messageBox = $('.productAttributes-message');
                const data = response.data || {};

                if (data.purchasing_message) {
                    $('.alertBox-message', $messageBox).text(data.purchasing_message);
                    $messageBox.show();
                } else {
                    $messageBox.hide();
                }

                if (_.isObject(data.price)) {
                    if (data.price.with_tax) {
                        viewModel.$priceWithTax.html(data.price.with_tax.formatted);
                    }

                    if (data.price.without_tax) {
                        viewModel.$priceWithoutTax.html(data.price.without_tax.formatted);
                    }

                    if (data.price.rrp_with_tax) {
                        viewModel.$rrpWithTax.html(data.price.rrp_with_tax.formatted);
                    }

                    if (data.price.rrp_without_tax) {
                        viewModel.$rrpWithoutTax.html(data.price.rrp_without_tax.formatted);
                    }
                }

                if (_.isObject(data.weight)) {
                    viewModel.$weight.html(data.weight.formatted);
                }

                // Set variation_id if it exists for adding to wishlist
                if (data.variantId) {
                    viewModel.$wishlistVariation.val(data.variantId);
                }

                // If SKU is available
                if (data.sku) {
                    viewModel.$sku.text(data.sku);
                }

                if (_.isObject(data.image)) {
                    const zoomImageUrl = utils.tools.image.getSrc(
                        data.image.data,
                        this.context.themeImageSizes.zoom
                    );

                    const mainImageUrl = utils.tools.image.getSrc(
                        data.image.data,
                        this.context.themeImageSizes.product
                    );

                    this.imageGallery.setAlternateImage({
                        mainImageUrl: mainImageUrl,
                        zoomImageUrl: zoomImageUrl,
                    });
                } else {
                    this.imageGallery.restoreImage();
                }

                // if stock view is on (CP settings)
                if (viewModel.stock.$container.length && data.stock) {
                    // if the stock container is hidden, show
                    if (viewModel.stock.$container.is(':hidden')) {
                        viewModel.stock.$container.show();
                    }

                    viewModel.stock.$input.text(data.stock);
                }

                if (!data.purchasable || !data.instock) {
                    viewModel.$addToCart.prop('disabled', true);
                    viewModel.$increments.prop('disabled', true);
                } else {
                    viewModel.$addToCart.prop('disabled', false);
                    viewModel.$increments.prop('disabled', false);
                }
            });
        });
    }

    /**
     *
     * Handle action when the shopper clicks on + / - for quantity
     *
     */
    quantityChange() {
        this.$scope.on('click', '[data-quantity-change] button', (event) => {
            event.preventDefault();

            const $target = $(event.currentTarget);
            const viewModel = this.getViewModel(this.$scope);
            const $input = viewModel.quantity.$input;
            const quantityMin = parseInt($input.data('quantity-min'), 10);
            const quantityMax = parseInt($input.data('quantity-max'), 10);

            let qty = parseInt($input.val(), 10);

            // If action is incrementing
            if ($target.data('action') === 'inc') {
                // If quantity max option is set
                if (quantityMax > 0) {
                    // Check quantity does not exceed max
                    if ((qty + 1) <= quantityMax) {
                        qty++;
                    }
                } else {
                    qty++;
                }
            } else if (qty > 1) {
                // If quantity min option is set
                if (quantityMin > 0) {
                    // Check quantity does not fall below min
                    if ((qty - 1) >= quantityMin) {
                        qty--;
                    }
                } else {
                    qty--;
                }
            }

            // update hidden input
            viewModel.quantity.$input.val(qty);
            // update text
            viewModel.quantity.$text.text(qty);
        });
    }

    /**
     *
     * Add a product to cart
     *
     */
    addProductToCart() {
        const $previewModal = $('#previewModal');

        utils.hooks.on('cart-item-add', (event, form) => {
            const $addToCartBtn = $('#form-action-addToCart', $(event.target));
            const originalBtnVal = $addToCartBtn.val();
            const waitMessage = $addToCartBtn.data('waitMessage');

            // Do not do AJAX if browser doesn't support FormData
            if (window.FormData === undefined) {
                return;
            }

            // Prevent default
            event.preventDefault();

            $addToCartBtn
                .val(waitMessage)
                .prop('disabled', true);

            // Add item to cart
            utils.api.cart.itemAdd(new FormData(form), (err, response) => {
                const errorMessage = err || response.data.error;

                $addToCartBtn
                    .val(originalBtnVal)
                    .prop('disabled', false);

                // Guard statement
                if (errorMessage) {
                    // Strip the HTML from the error message
                    const tmp = document.createElement('DIV');
                    tmp.innerHTML = errorMessage;

                    alert(tmp.textContent || tmp.innerText);

                    return;
                }

                // Optimistic loading
                this.openCartModal($previewModal);

                // Show modal
                this.populateCartModal($previewModal, response.data.cart_item.hash, ($modalContent) => {
                    // Update cart counter
                    const $body = $('body');
                    const $cartQuantity = $('[data-cart-quantity]', $modalContent);
                    const $cartCounter = $('.navUser-action .cart-count');
                    const quantity = $cartQuantity.data('cart-quantity') || 0;

                    $cartCounter.addClass('cart-count--positive');
                    $body.trigger('cart-quantity-update', quantity);
                });
            });
        });
    }

    /**
     * Open cart modal
     */
    openCartModal($modal) {
        $modal.foundation('reveal', 'open');
    }

    /**
     * Close cart modal
     */
    closeCartModal($modal) {
        $modal.foundation('reveal', 'close');
    }

    /**
     * Populate cart modal
     *
     * @param {jQuery} $modal
     * @param {String} cartItemHash
     * @param {Function} onComplete
     */
    populateCartModal($modal, cartItemHash, onComplete) {
        // Define options
        const $modalContent = $('.modal-content', $modal);
        const $modalOverlay = $('.loadingOverlay', $modal);

        const options = {
            template: 'cart/preview',
            params: {
                suggest: cartItemHash,
            },
            config: {
                cart: {
                    suggestions: {
                        limit: 4,
                    },
                },
            },
        };

        // Fetch cart to display in modal
        utils.api.cart.getContent(options, (err, response) => {
            // Insert fetched content into modal
            $modalOverlay.hide();
            $modalContent.html(response);

            onComplete($modalContent);
        });
    }
}
