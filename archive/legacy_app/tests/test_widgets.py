"""Tests for pfui.widgets package."""

from __future__ import annotations


class TestWidgetsImport:
    """Test that widgets package imports work correctly."""

    def test_widgets_package_imports(self):
        """Test that all widget modules can be imported."""
        from pfui.widgets import (
            button_with_callback,
            export_button,
            float_slider,
            info_badge,
            int_slider,
            metric_display,
            number_input_validated,
            radio_selector,
            reset_button,
            select_box,
            status_message,
            text_input_validated,
        )

        # Verify functions are callable
        assert callable(button_with_callback)
        assert callable(export_button)
        assert callable(reset_button)
        assert callable(float_slider)
        assert callable(int_slider)
        assert callable(select_box)
        assert callable(radio_selector)
        assert callable(number_input_validated)
        assert callable(text_input_validated)
        assert callable(metric_display)
        assert callable(info_badge)
        assert callable(status_message)

    def test_sliders_module(self):
        """Test sliders module functions exist."""
        from pfui.widgets.sliders import float_slider, int_slider, range_slider

        assert callable(float_slider)
        assert callable(int_slider)
        assert callable(range_slider)

    def test_buttons_module(self):
        """Test buttons module functions exist."""
        from pfui.widgets.buttons import (
            button_with_callback,
            export_button,
            reset_button,
        )

        assert callable(button_with_callback)
        assert callable(export_button)
        assert callable(reset_button)

    def test_selectors_module(self):
        """Test selectors module functions exist."""
        from pfui.widgets.selectors import checkbox_group, radio_selector, select_box

        assert callable(select_box)
        assert callable(radio_selector)
        assert callable(checkbox_group)

    def test_inputs_module(self):
        """Test inputs module functions exist."""
        from pfui.widgets.inputs import number_input_validated, text_input_validated

        assert callable(number_input_validated)
        assert callable(text_input_validated)

    def test_displays_module(self):
        """Test displays module functions exist."""
        from pfui.widgets.displays import info_badge, metric_display, status_message

        assert callable(metric_display)
        assert callable(info_badge)
        assert callable(status_message)


class TestWidgetFunctionSignatures:
    """Test that widget functions have correct signatures."""

    def test_float_slider_signature(self):
        """Test float_slider has expected parameters."""
        import inspect

        from pfui.widgets.sliders import float_slider

        sig = inspect.signature(float_slider)
        assert "label" in sig.parameters
        assert "min_value" in sig.parameters
        assert "max_value" in sig.parameters
        assert "value" in sig.parameters

    def test_button_with_callback_signature(self):
        """Test button_with_callback has expected parameters."""
        import inspect

        from pfui.widgets.buttons import button_with_callback

        sig = inspect.signature(button_with_callback)
        assert "label" in sig.parameters
        assert "callback" in sig.parameters

    def test_select_box_signature(self):
        """Test select_box has expected parameters."""
        import inspect

        from pfui.widgets.selectors import select_box

        sig = inspect.signature(select_box)
        assert "label" in sig.parameters
        assert "options" in sig.parameters
